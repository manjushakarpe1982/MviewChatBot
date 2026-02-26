// routes/chat.routes.js

const express = require("express");
const router = express.Router();
const { chat, testing, mviewAssistant } = require("../controllers/chat.controller");

router.post("/chat", chat);

router.get("/welcome", testing);

router.post("/MviewAssistant", mviewAssistant);

module.exports = router;
