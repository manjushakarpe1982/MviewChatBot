// services/chat.service.js

const axios = require("axios");
const {
  OLLAMA_URL,
  MODEL_NAME,
  SERVICE_DOWN_MESSAGE,
  UNKNOWN_LEASE_MESSAGE,
  UNKNOWN_OPERATOR_MESSAGE,
  INVALID_INPUT_MESSAGE,
  GENERIC_UNKNOWN_MESSAGE,
  OUT_OF_SCOPE_REFUSAL,
  REALTIME_REFUSAL,
  MINERAL_VIEW_SUPPORT,
  COMMON_CORRECTIONS,
  MAX_MEMORY_TURNS,
} = require("../config/constants");

// =====================================
// MEMORY & CACHE STORAGE
// =====================================

const conversationMemory = [];
const responseCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const MAX_CACHE_SIZE = 1000;

// =====================================
// HTTP CLIENT WITH CONNECTION POOLING
// =====================================

const httpAgent = new (require('http').Agent)({ 
  keepAlive: true,
  maxSockets: 5,
  timeout: 8000
});

const axiosInstance = axios.create({
  httpAgent,
  timeout: 8000, // 8 second timeout instead of 120 seconds
});

// =====================================
// PREDEFINED RESPONSES FOR COMMON QUERIES
// =====================================

const PREDEFINED_RESPONSES = {
  'what is boe': 'BOE stands for Barrel of Oil Equivalent, a unit measuring energy content of oil and gas.',
  'what is mcf': 'MCF stands for thousand cubic feet, a standard unit for measuring natural gas volume.',
  'what is eur': 'EUR stands for Estimated Ultimate Recovery, the total hydrocarbons expected from a well.',
  'what is api': 'API number is a unique identifier assigned by the American Petroleum Institute to oil and gas wells.',
  'what is rrc': 'RRC refers to the Railroad Commission of Texas, which regulates oil and gas operations in Texas.',
  'hello': 'Hello! How may I help you with Texas oil and gas concepts today?',
  'hi': 'Hello! How may I help you with Texas oil and gas concepts today?',
  'hey': 'Hello! How may I help you with Texas oil and gas concepts today?',
};

// =====================================
// CACHE MANAGEMENT
// =====================================

function getCacheKey(question) {
  return question.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ');
}

function getFromCache(question) {
  const key = getCacheKey(question);
  const cached = responseCache.get(key);
  
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.response;
  }
  
  if (cached) {
    responseCache.delete(key); // Remove expired cache
  }
  
  return null;
}

function saveToCache(question, response) {
  const key = getCacheKey(question);
  
  // Implement LRU cache by removing oldest entries
  if (responseCache.size >= MAX_CACHE_SIZE) {
    const firstKey = responseCache.keys().next().value;
    responseCache.delete(firstKey);
  }
  
  responseCache.set(key, {
    response,
    timestamp: Date.now()
  });
}

function getPredefinedResponse(question) {
  const key = getCacheKey(question);
  return PREDEFINED_RESPONSES[key] || null;
}

// =====================================
// SPELLING NORMALIZATION
// =====================================

function normalizeSpelling(text) {
  const words = text.split(" ");
  const corrected = words.map((w) => {
    const lw = w.toLowerCase();
    return COMMON_CORRECTIONS[lw] !== undefined ? COMMON_CORRECTIONS[lw] : w;
  });
  return corrected.join(" ");
}

// =====================================
// INPUT VALIDATION
// =====================================

function isValidQuestion(text) {
  if (!text) return false;

  text = text.trim();

  if (["\\", "/", ".", ",", "-", "_"].includes(text)) return false;

  if (text.length < 2) return false;

  return true;
}

// =====================================
// LEASE / OPERATOR DETECTION
// =====================================

function detectLeaseQuery(text) {
  const leaseKeywords = ["lease", "unit", "field"];
  return leaseKeywords.some((k) => text.toLowerCase().includes(k));
}

function detectOperatorQuery(text) {
  const operatorKeywords = [
    "operator", "operated", "company",
    "corp", "llc", "inc", "energy", "petroleum",
  ];
  return operatorKeywords.some((k) => text.toLowerCase().includes(k));
}

// =====================================
// PROMPT BUILDER
// =====================================

function buildOptimizedPrompt(userQuestion) {
  // Shorter, more direct prompt for faster processing
  return `Texas oil/gas expert. Respond in JSON: {"intent":"GREETING|INDUSTRY_CONCEPT|REALTIME_DATA|MINERAL_VIEW_SUPPORT|OUT_OF_SCOPE","answer":"response"}

Rules: GREETING="Hello! How may I help you with Texas oil and gas concepts today?", INDUSTRY_CONCEPT=max 30 words factual answer, REALTIME_DATA="${REALTIME_REFUSAL}", MINERAL_VIEW_SUPPORT="${MINERAL_VIEW_SUPPORT}", OUT_OF_SCOPE="${OUT_OF_SCOPE_REFUSAL}"

Q: ${userQuestion}`;
}

// =====================================
// CLEAN AND PARSE MODEL RESPONSE
// =====================================

function cleanResponse(text) {
  if (!text) return GENERIC_UNKNOWN_MESSAGE;

  text = text.trim();

  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}") + 1;

    if (start === -1 || end === 0) return GENERIC_UNKNOWN_MESSAGE;

    const jsonText = text.slice(start, end);
    const data = JSON.parse(jsonText);

    let answer = data.answer !== undefined ? data.answer : GENERIC_UNKNOWN_MESSAGE;

    const words = answer.split(" ");
    if (words.length > 30) {
      answer = words.slice(0, 30).join(" ") + ".";
    }

    // Prevent repeated identical answers
    if (conversationMemory.length > 0) {
      const lastAnswer = conversationMemory[conversationMemory.length - 1].assistant;
      if (lastAnswer === answer) {
        answer += " (Per Texas Railroad Commission standards.)";
      }
    }

    return answer;
  } catch (e) {
    return GENERIC_UNKNOWN_MESSAGE;
  }
}

// =====================================
// ASK MODEL
// =====================================

async function askChatbot(userQuestion) {
  userQuestion = normalizeSpelling(userQuestion);

  if (!isValidQuestion(userQuestion)) {
    return INVALID_INPUT_MESSAGE;
  }

  // Check for predefined responses first (instant response)
  const predefinedResponse = getPredefinedResponse(userQuestion);
  if (predefinedResponse) {
    return predefinedResponse;
  }

  // Check cache (near-instant response)
  const cachedResponse = getFromCache(userQuestion);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Optimized prompt for faster processing
  const prompt = buildOptimizedPrompt(userQuestion);

  const payload = {
    model: MODEL_NAME,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.1,
      top_p: 0.9,
      repeat_penalty: 1.1, // Reduced from 1.2
      num_predict: 60,     // Reduced from 120 for faster response
    },
  };

  try {
    const response = await axiosInstance.post(OLLAMA_URL, payload);

    if (response.status !== 200) {
      console.log(SERVICE_DOWN_MESSAGE);
      return SERVICE_DOWN_MESSAGE;
    }

    const rawText = response.data.response || "";
    const cleanedResponse = cleanResponse(rawText);
    
    // Cache the response for future use
    saveToCache(userQuestion, cleanedResponse);
    
    return cleanedResponse;
  } catch (e) {
    console.log('API Error:', e.message);
    
    // Fallback to generic response if API fails
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return "I'm experiencing high load. Please try rephrasing your question or try again shortly.";
    }
    
    return SERVICE_DOWN_MESSAGE;
  }
}

// =====================================
// MEMORY CONTEXT BUILDER
// =====================================

function buildContextualQuestion(userQuestion) {
  if (conversationMemory.length === 0) return userQuestion;

  const recentMemory = conversationMemory.slice(-MAX_MEMORY_TURNS);
  let context = "";

  for (const item of recentMemory) {
    context += `User: ${item.user}\n`;
    context += `Assistant: ${item.assistant}\n`;
  }

  context += `User: ${userQuestion}`;
  return context;
}

// =====================================
// ASK WITH MEMORY
// =====================================

async function askChatbotWithMemory(userQuestion) {
  const contextualQuestion = buildContextualQuestion(userQuestion);

  let answer = await askChatbot(contextualQuestion);

  if (detectLeaseQuery(userQuestion) && answer.toLowerCase().includes("don't have specific information")) {
    answer = UNKNOWN_LEASE_MESSAGE;
  }

  if (detectOperatorQuery(userQuestion) && answer.toLowerCase().includes("don't have specific information")) {
    answer = UNKNOWN_OPERATOR_MESSAGE;
  }

  conversationMemory.push({
    user: userQuestion,
    assistant: answer,
  });

  if (conversationMemory.length > MAX_MEMORY_TURNS) {
    conversationMemory.shift();
  }

  return answer;
}

module.exports = {
  askChatbotWithMemory,
};
