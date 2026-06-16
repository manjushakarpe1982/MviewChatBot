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

async function runBackup() {
  const { production, staging, tables } = config;

  const prod = new Client(production);
  const stg = new Client(staging);

  await prod.connect();
  await stg.connect();

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
      const sourceStream = prod.query(
        copyStreams.to(`COPY public."${t}" TO STDOUT (FORMAT binary)`)
      );
      const destStream = stg.query(
        copyStreams.from(`COPY public."${t}" FROM STDIN (FORMAT binary)`)
      );

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
