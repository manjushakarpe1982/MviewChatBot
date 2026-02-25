// server.js

const express = require("express");
const chatRoutes = require("./routes/chat.routes");
const { restartModel } = require("./services/chat.service");
const { MODEL_NAME } = require("./config/constants");

const app = express();
app.use(express.json());

// =====================================
// ROUTES
// =====================================

app.use("/api", chatRoutes);

// =====================================
// START SERVER
// =====================================

const PORT = process.env.PORT || 2044;

// Restart model before accepting requests (mirrors Python startup behaviour)
restartModel(MODEL_NAME).then(() => {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server running on port ${PORT}`);
  });
});