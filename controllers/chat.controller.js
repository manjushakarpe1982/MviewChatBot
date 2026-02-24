// controllers/chat.controller.js

const { askChatbotWithMemory } = require("../services/chat.service");
const { INVALID_INPUT_MESSAGE } = require("../config/constants");

async function chat(req, res) {
  const { question } = req.body;
console.log('api code running')
  if (!question || question.trim() === "") {
    return res.status(400).json({ error: INVALID_INPUT_MESSAGE });
  }

  const userQuestion = question.trim();

  if (
    userQuestion.toLowerCase() === "exit" ||
    userQuestion.toLowerCase() === "quit"
  ) {
    return res.json({ answer: "Goodbye." });
  }

  const answer = await askChatbotWithMemory(userQuestion);

  return res.json({ answer });
}

async function testing(req, res) {
  return res.json({ message : 'welcome to chatboat vaishnavi' }); 
}

module.exports = {
  chat,
  testing
};
