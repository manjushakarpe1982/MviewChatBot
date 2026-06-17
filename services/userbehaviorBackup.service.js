// services/userbehaviorBackup.service.js
//
// DEDICATED fast sync for the single, very large `userbehavior` table
// (~5,000,000 rows). Kept separate from services/backup.service.js because the
// small tables don't need (and shouldn't pay for) the heavy tuning below.
//
// Strategy for a fast bulk load of millions of rows:
//   1. Capture + DROP the table's secondary indexes on staging (rebuilding an
//      index once at the end is far faster than maintaining it per-row).
//   2. Tune the staging load session: skip FK/trigger checks, don't fsync each
//      commit, give index rebuilds more memory.
//   3. TRUNCATE staging.userbehavior (clears old data -> no duplicates).
//   4. Stream the rows prod -> staging with binary COPY (smallest + fastest
//      wire format, constant memory -- nothing is buffered in Node).
//   5. Recreate the indexes and ANALYZE so the table is query-ready.
//
// PRODUCTION is opened READ ONLY at the server level and only ever read from.
// `spendingtime` is a GENERATED column, so it is never copied; staging
// recomputes it after load (same endtime-starttime value).

const { Client } = require("pg");
const copyStreams = require("pg-copy-streams");
const { pipeline } = require("stream/promises");
const config = require("../config/backupConfig");

const TABLE = "userbehavior";

// Columns staging will accept (everything except generated columns).
async function writableColumns(client, table) {
  const q = `SELECT column_name FROM information_schema.columns
             WHERE table_schema = 'public' AND table_name = $1
               AND is_generated = 'NEVER'
             ORDER BY ordinal_position`;
  return (await client.query(q, [table])).rows.map((r) => r.column_name);
}

// Secondary indexes we can safely drop for the load and recreate afterward.
// Excludes the PRIMARY KEY and any constraint-backed (UNIQUE/exclusion) index.
async function secondaryIndexes(client, table) {
  const q = `
    SELECT c.relname AS name, pg_get_indexdef(x.indexrelid) AS def
    FROM pg_index x
    JOIN pg_class c ON c.oid = x.indexrelid
    JOIN pg_class t ON t.oid = x.indrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public' AND t.relname = $1
      AND NOT x.indisprimary
      AND NOT EXISTS (SELECT 1 FROM pg_constraint con WHERE con.conindid = x.indexrelid)`;
  return (await client.query(q, [table])).rows;
}

async function runUserbehaviorBackup() {
  const { production, staging } = config;
  const startedAt = Date.now();

  const prod = new Client(production);
  const stg = new Client(staging);
  await prod.connect();
  await stg.connect();

  // HARD GUARANTEE: production session is read-only at the server level.
  await prod.query("SET default_transaction_read_only = on");

  // Safety: never let prod and staging point at the same database.
  if (
    production.host === staging.host &&
    production.port === staging.port &&
    production.database === staging.database
  ) {
    await prod.end().catch(() => {});
    await stg.end().catch(() => {});
    throw new Error(
      "Refusing to run: production and staging point to the same database."
    );
  }

  // Capture indexes BEFORE dropping so we can always put them back.
  const indexes = await secondaryIndexes(stg, TABLE);
  let indexesDropped = false;

  try {
    // --- Tune the staging load session for bulk insert -------------------
    await stg.query("SET session_replication_role = replica"); // skip FK/triggers
    await stg.query("SET synchronous_commit = off"); // don't fsync per commit
    await stg.query("SET maintenance_work_mem = '512MB'"); // faster index rebuild

    // --- Drop secondary indexes -----------------------------------------
    for (const idx of indexes) {
      await stg.query(`DROP INDEX IF EXISTS public."${idx.name}"`);
    }
    indexesDropped = true;
    if (indexes.length) {
      console.log(`[userbehavior] dropped ${indexes.length} index(es) for fast load`);
    }

    // --- Clear old data (no duplicates) ---------------------------------
    await stg.query(`TRUNCATE TABLE public."${TABLE}" RESTART IDENTITY`);

    // --- Stream prod -> staging with binary COPY ------------------------
    const cols = await writableColumns(stg, TABLE);
    const colList = cols.map((c) => `"${c}"`).join(", ");

    const sourceStream = prod.query(
      copyStreams.to(`COPY (SELECT ${colList} FROM public."${TABLE}") TO STDOUT (FORMAT binary)`)
    );
    const destStream = stg.query(
      copyStreams.from(`COPY public."${TABLE}" (${colList}) FROM STDIN (FORMAT binary)`)
    );

    console.log(`[userbehavior] copying rows...`);
    await pipeline(sourceStream, destStream);
    const rows = destStream.rowCount || 0;

    // --- Recreate indexes + refresh stats -------------------------------
    for (const idx of indexes) {
      console.log(`[userbehavior] rebuilding index ${idx.name}...`);
      await stg.query(idx.def);
    }
    indexesDropped = false;

    await stg.query(`ANALYZE public."${TABLE}"`);

    const secs = ((Date.now() - startedAt) / 1000).toFixed(1);
    console.log(`[userbehavior] done: ${rows} rows in ${secs}s`);
    return { table: TABLE, rows, seconds: Number(secs) };
  } finally {
    // If we failed after dropping indexes, try hard to put them back so the
    // staging table is never left un-indexed.
    if (indexesDropped) {
      for (const idx of indexes) {
        await stg.query(idx.def).catch((e) =>
          console.error(`[userbehavior] failed to recreate index ${idx.name}: ${e.message}`)
        );
      }
    }
    // Reset session settings (they're connection-scoped, but be explicit).
    await stg.query("SET session_replication_role = DEFAULT").catch(() => {});
    await stg.query("SET synchronous_commit = on").catch(() => {});
    await prod.end().catch(() => {});
    await stg.end().catch(() => {});
  }
}

module.exports = { runUserbehaviorBackup };
