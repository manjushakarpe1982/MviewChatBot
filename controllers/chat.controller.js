// controllers/chat.controller.js

const { askChatbotWithMemory } = require("../services/chat.service");
const { INVALID_INPUT_MESSAGE } = require("../config/constants");

async function chat(req, res) {
  const startTime = Date.now();
  const { question } = req.body;
  
  console.log('Chat API called:', new Date().toISOString());
  
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

  try {
    const answer = await askChatbotWithMemory(userQuestion);
    const responseTime = Date.now() - startTime;
    
    console.log(`Response time: ${responseTime}ms`);
    
    return res.json({ 
      answer,
      responseTime: `${responseTime}ms`
    });
  } catch (error) {
    console.error('Chat error:', error);
    return res.status(500).json({ 
      error: "Sorry, I'm experiencing technical difficulties. Please try again." 
    });
  }
}

async function testing(req, res) {
  return res.json({ message : 'welcome to chatboat vaishnavi' }); 
}

module.exports = {
  chat,
  testing
};
