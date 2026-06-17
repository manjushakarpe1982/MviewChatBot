// cron/backup.cron.js
//
// Registers the daily Production -> Production_Backup sync as a cron job.
// Started from server.js when the Express app boots.

const cron = require("node-cron");
const { runBackup } = require("../services/backup.service");
const config = require("../config/backupConfig");

function startBackupCron() {
  if (!cron.validate(config.schedule)) {
    console.error(`[backup] invalid cron expression: ${config.schedule}`);
    return;
  }

  console.log(`[backup] cron scheduled: "${config.schedule}" (${config.timezone})`);

  cron.schedule(
    config.schedule,
    async () => {
      const startedAt = new Date().toISOString();
      console.log(`[backup] ${startedAt} starting Production_Backup sync...`);
      try {
        const summary = await runBackup();
        const total = summary.reduce((n, s) => n + s.rows, 0);
        console.log(`[backup] done. ${summary.length} tables, ${total} rows total.`);
      } catch (err) {
        console.error(`[backup] FAILED:`, err.message);
      }
    },
    { timezone: config.timezone }
  );
}

module.exports = { startBackupCron };
