// controllers/chat.controller.js

const { askChatbotWithMemory, mviewAssistantService } = require("../services/chat.service");
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

async function mviewAssistant(req, res) {
  const { member_id, email, question } = req.body;

  if (!question || question.trim() === "") {
    return res.status(400).json({ error: "Question is required." });
  }

  if (!member_id && !email) {
    return res
      .status(400)
      .json({ error: "Either member_id or email is required." });
  }

  try {
    const result = await mviewAssistantService({
      member_id: member_id || null,
      email: email || null,
      question: question.trim(),
    });

    if (result.success) {
      return res.status(200).json({ answer: result.answer });
    } else {
      return res.status(202).json({ message: result.message });
    }
  } catch (err) {
    console.error("MviewAssistant error:", err);
    return res.status(500).json({
      error:
        "An internal server error occurred. Please try again later.",
    });
  }
}

module.exports = {
  chat,
  testing,
  mviewAssistant,
};
