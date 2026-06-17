// scripts/runUserbehaviorBackup.js
//
// Run the dedicated userbehavior (large table) sync ONCE, immediately.
//
//   node scripts/runUserbehaviorBackup.js
//   npm run backup:userbehavior

require("dotenv").config();
const { runUserbehaviorBackup } = require("../services/userbehaviorBackup.service");

(async () => {
  const startedAt = new Date().toISOString();
  console.log(`[userbehavior] ${startedAt} starting (manual run)...`);
  try {
    await runUserbehaviorBackup();
    process.exit(0);
  } catch (err) {
    console.error(`[userbehavior] FAILED:`, err);
    process.exit(1);
  }
})();
