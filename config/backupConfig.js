// config/backupConfig.js
//
// Configuration for the daily Production -> Production_Backup table sync.
// Values fall back to literals (same pattern as config/db.js) but can be
// overridden by environment variables without editing this file.

module.exports = {
  // SOURCE: production PostgreSQL (READ ONLY -- only SELECT/COPY TO is run here)
  production: {
    host: process.env.PG_PROD_HOST || "108.181.152.168",
    port: Number(process.env.PG_PROD_PORT || 5432),
    database: process.env.PG_PROD_DB || "Production",
    user: process.env.PG_PROD_USER || "postgres",
    password: process.env.PG_PROD_PWD || "MViewDb@3625Pwd",
  },

  // TARGET: staging server, Production_Backup database (gets truncated + reloaded)
  staging: {
    host: process.env.PG_STG_HOST || "108.181.168.43",
    port: Number(process.env.PG_STG_PORT || 5432),
    database: process.env.PG_STG_DB || "Production_Backup",
    user: process.env.PG_STG_USER || "postgres",
    password: process.env.PG_STG_PWD || "MViewStag@47Pwd",
  },

  // Tables to copy (order does not matter -- FK checks are disabled during load)
  tables: [
    "members_entity",
    "lease_claim_requests",
    "subscription_checkout_logs",
    "sub_subscription_plan",
    "membersclaimedleases",
    "professional_claimed_owners",
    // "userbehavior",
  ],

  // Daily run time, cron format (default 02:00 server time).
  // "minute hour day month weekday"
  schedule: process.env.PG_BACKUP_CRON || "0 2 * * *",
};
