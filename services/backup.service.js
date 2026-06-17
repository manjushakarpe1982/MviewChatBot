// services/backup.service.js
//
// Copies a fixed set of tables from PRODUCTION into the Production_Backup
// database on STAGING. Equivalent of `pg_dump --data-only | pg_restore`, but
// done with streaming binary COPY between the two live connections so no
// pg_dump.exe binary is required.
//
// Flow:
//   1. On staging: disable FK/triggers for this session.
//   2. TRUNCATE all target tables in ONE statement (FK-safe between them).
//   3. For each table: COPY ... TO STDOUT (binary) on prod  ->  pipe  ->
//      COPY ... FROM STDIN (binary) on staging.
//
// PRODUCTION is only ever read from (COPY TO STDOUT = SELECT). It is never
// modified. Only Production_Backup on staging is written to.

const { Client } = require("pg");
const copyStreams = require("pg-copy-streams");
const { pipeline } = require("stream/promises");
const config = require("../config/backupConfig");

// Names of a table's GENERATED columns (e.g. userbehavior.spendingtime).
// PostgreSQL 12 forbids generated columns in a plain COPY in either direction,
// which is why a whole-table COPY of userbehavior fails / stalls.
async function generatedColumns(client, table) {
  const q = `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
               AND is_generated <> 'NEVER'`;
  return (await client.query(q, [table])).rows.map((r) => r.column_name);
}

// A table's non-generated (writable) columns, in order. These are the columns
// we can COPY into staging; staging recomputes its generated ones itself.
async function writableColumns(client, table) {
  const q = `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
               AND is_generated = 'NEVER'
             ORDER BY ordinal_position`;
  return (await client.query(q, [table])).rows.map((r) => r.column_name);
}

async function runBackup() {
  const { production, staging, tables } = config;

  const prod = new Client(production);
  const stg = new Client(staging);

  await prod.connect();
  await stg.connect();

  // HARD GUARANTEE: lock the production session to read-only at the server
  // level. Any write (INSERT/UPDATE/DELETE/TRUNCATE/DDL) on this connection is
  // now rejected by PostgreSQL itself -- only SELECT / COPY ... TO STDOUT run.
  // This protects production even if the code below is changed later.
  await prod.query("SET default_transaction_read_only = on");

  const summary = [];

  try {
    // Safety: never let prod and staging point at the same database.
    if (
      production.host === staging.host &&
      production.port === staging.port &&
      production.database === staging.database
    ) {
      throw new Error(
        "Refusing to run: production and staging point to the same database."
      );
    }

    // Disable FK constraint triggers for the load (so COPY order never blocks).
    await stg.query("SET session_replication_role = replica");

    // Truncate all target tables together (FK references between them are OK).
    const list = tables.map((t) => `public."${t}"`).join(", ");
    try {
      await stg.query(`TRUNCATE TABLE ${list} RESTART IDENTITY`);
    } catch (err) {
      // Fallback if the FK graph reaches tables outside this set.
      console.warn("  plain TRUNCATE failed, retrying with CASCADE:", err.message);
      await stg.query(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    }

    // Stream each table prod -> staging using binary COPY.
    for (const t of tables) {
      const genCols = await generatedColumns(prod, t);

      let sourceSql, destSql;
      if (genCols.length > 0) {
        // Table has a generated column (userbehavior.spendingtime). A plain
        // whole-table COPY breaks on PG 12, so list only the writable columns.
        // COPY (SELECT ...) is used on the source because that form CAN read a
        // generated value out; staging recomputes spendingtime to the same
        // value after load, so no production data is lost.
        const cols = await writableColumns(stg, t);
        const colList = cols.map((c) => `"${c}"`).join(", ");
        sourceSql = `COPY (SELECT ${colList} FROM public."${t}") TO STDOUT (FORMAT binary)`;
        destSql = `COPY public."${t}" (${colList}) FROM STDIN (FORMAT binary)`;
      } else {
        // No generated columns: copy the whole table exactly as before.
        sourceSql = `COPY public."${t}" TO STDOUT (FORMAT binary)`;
        destSql = `COPY public."${t}" FROM STDIN (FORMAT binary)`;
      }

      const sourceStream = prod.query(copyStreams.to(sourceSql));
      const destStream = stg.query(copyStreams.from(destSql));

      await pipeline(sourceStream, destStream);

      // rowCount is populated on the COPY FROM stream once finished.
      const rows = destStream.rowCount || 0;
      summary.push({ table: t, rows });
      console.log(`  copied ${t} (${rows} rows)`);
    }

    // Re-enable normal trigger behaviour for this session.
    await stg.query("SET session_replication_role = DEFAULT");
  } finally {
    await prod.end().catch(() => {});
    await stg.end().catch(() => {});
  }

  return summary;
}

module.exports = { runBackup };
