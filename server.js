// server.js

require("dotenv").config();

const express = require("express");
const cors = require("cors");
const chatRoutes = require("./routes/chat.routes");
const { startBackupCron } = require("./cron/backup.cron");

const app = express();

app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
}));

app.use(express.json());

// =====================================
// ROUTES
// =====================================

app.use("/api", chatRoutes);

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 2044;

app.listen(PORT, "127.0.0.1", () => {
  console.log(`Server running on port ${PORT}`);
  // Register the daily Production -> Production_Backup sync cron.
  startBackupCron();
});