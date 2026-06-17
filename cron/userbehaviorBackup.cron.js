// cron/userbehaviorBackup.cron.js
//
// Registers the dedicated `userbehavior` (large table) sync as its own cron
// job, separate from the small-tables backup so it can run on its own schedule.
// Started from server.js when the Express app boots.

const cron = require("node-cron");
const { runUserbehaviorBackup } = require("../services/userbehaviorBackup.service");
const config = require("../config/backupConfig");

function startUserbehaviorBackupCron() {
  const schedule = config.userbehaviorSchedule;

  if (!cron.validate(schedule)) {
    console.error(`[userbehavior] invalid cron expression: ${schedule}`);
    return;
  }

  console.log(`[userbehavior] cron scheduled: "${schedule}"`);

  cron.schedule(schedule, async () => {
    const startedAt = new Date().toISOString();
    console.log(`[userbehavior] ${startedAt} starting sync...`);
    try {
      await runUserbehaviorBackup();
    } catch (err) {
      console.error(`[userbehavior] FAILED:`, err.message);
    }
  });
}

module.exports = { startUserbehaviorBackupCron };
