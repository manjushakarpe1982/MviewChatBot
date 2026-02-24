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
    
    // Add performance indicator
    const performanceIndicator = responseTime < 1000 ? 'fast' : responseTime < 3000 ? 'normal' : 'slow';
    
    return res.json({ 
      answer,
      responseTime: `${responseTime}ms`,
      performance: performanceIndicator
    });
  } catch (error) {
    console.error('Chat error:', error);
    const responseTime = Date.now() - startTime;
    
    return res.status(200).json({ // Return 200 instead of 500 for better UX
      answer: "I can help with Texas oil and gas concepts like BOE, MCF, API numbers, drilling, and RRC regulations. Could you rephrase your question?",
      responseTime: `${responseTime}ms`,
      performance: 'fallback'
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
