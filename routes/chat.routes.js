// routes/chat.routes.js

const express = require("express");
const router = express.Router();
const { chat, testing } = require("../controllers/chat.controller");

router.post("/chat", chat);

router.get("/welcome", testing)

module.exports = router;
