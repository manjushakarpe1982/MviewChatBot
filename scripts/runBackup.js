// scripts/runBackup.js
//
// Run the Production_Backup sync ONCE, immediately. Use this to test manually,
// or to drive it from an external scheduler (Windows Task Scheduler / cron)
// instead of the in-process node-cron.
//
//   node scripts/runBackup.js

require("dotenv").config();
const { runBackup } = require("../services/backup.service");

(async () => {
  const startedAt = new Date().toISOString();
  console.log(`[backup] ${startedAt} starting (manual run)...`);
  try {
    const summary = await runBackup();
    const total = summary.reduce((n, s) => n + s.rows, 0);
    console.log(`[backup] done. ${summary.length} tables, ${total} rows total.`);
    process.exit(0);
  } catch (err) {
    console.error(`[backup] FAILED:`, err);
    process.exit(1);
  }
})();
