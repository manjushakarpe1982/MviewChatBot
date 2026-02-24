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
  httpAgent
});

// =====================================
// PREDEFINED RESPONSES FOR COMMON QUERIES
// =====================================

// =====================================
// PREDEFINED FAST RESPONSES (PERFORMANCE OPTIMIZATION)
// =====================================

const FAST_RESPONSES = {
  // Exact match greetings for instant response
  'hello': 'Hello! How may I help you with Texas oil and gas concepts today?',
  'hi': 'Hello! How may I help you with Texas oil and gas concepts today?',
  'hey': 'Hello! How may I help you with Texas oil and gas concepts today?',
  'good morning': 'Hello! How may I help you with Texas oil and gas concepts today?',
  
  // Common technical terms for instant response
  'boe': 'BOE stands for Barrel of Oil Equivalent, a unit measuring energy content of oil and gas.',
  'mcf': 'MCF stands for thousand cubic feet, a standard unit for measuring natural gas volume.',
  'api': 'API number is a unique identifier assigned by the American Petroleum Institute to oil and gas wells.',
  'rrc': 'RRC refers to the Railroad Commission of Texas, which regulates oil and gas operations in Texas.',
};

// =====================================
// PYTHON-STYLE INTENT CLASSIFICATION
// =====================================

function classifyQuestionIntent(userQuestion) {
  const lowerQuestion = userQuestion.toLowerCase().trim();
  
  // Check for fast responses first (performance optimization)
  const fastResponse = FAST_RESPONSES[lowerQuestion];
  if (fastResponse) {
    return { intent: 'FAST_RESPONSE', answer: fastResponse };
  }
  
  // GREETING Intent - Exact matches only
  if (/^(hello|hi|hey|good morning|good afternoon|good evening)$/i.test(lowerQuestion)) {
    return { intent: 'GREETING', answer: 'Hello! How may I help you with Texas oil and gas concepts today?' };
  }
  
  // INDUSTRY_CONCEPT Intent - Texas oil and gas concepts
  const industryPatterns = [
    /\b(boe|barrel.*oil.*equivalent)\b/i,
    /\b(bbl|bbls|barrel)\b/i,
    /\b(mcf|thousand.*cubic.*feet)\b/i,
    /\b(eur|estimated.*ultimate.*recovery)\b/i,
    /\b(lease|unit|field)\b/i,
    /\b(well|wells)\b/i,
    /\b(operator|operated|company)\b/i,
    /\b(api.*number|api)\b/i,
    /\b(drilling.*permit|drilling)\b/i,
    /\b(completion.*record|completion)\b/i,
    /\b(texas.*railroad.*commission|rrc)\b/i,
    /\b(fracking|fracturing|hydraulic)\b/i,
    /\b(reserves|production)\b/i,
    /\b(permit|regulation)\b/i
  ];
  
  for (const pattern of industryPatterns) {
    if (pattern.test(lowerQuestion)) {
      return { intent: 'INDUSTRY_CONCEPT', answer: null }; // Will use LLM
    }
  }
  
  // REALTIME_DATA Intent
  if (/\b(current|now|today|real.*time|live|latest|price)\b/i.test(lowerQuestion)) {
    return { intent: 'REALTIME_DATA', answer: REALTIME_REFUSAL };
  }
  
  // MINERAL_VIEW_SUPPORT Intent
  if (/\b(mineral.*view|website|support|contact)\b/i.test(lowerQuestion)) {
    return { intent: 'MINERAL_VIEW_SUPPORT', answer: MINERAL_VIEW_SUPPORT };
  }
  
  // OUT_OF_SCOPE Intent
  if (/\b(weather|sports|politics|food|music|movie|game|celebrity)\b/i.test(lowerQuestion)) {
    return { intent: 'OUT_OF_SCOPE', answer: OUT_OF_SCOPE_REFUSAL };
  }
  
  // Default to INDUSTRY_CONCEPT if contains oil/gas related terms
  if (/\b(oil|gas|petroleum|energy|texas|mineral)\b/i.test(lowerQuestion)) {
    return { intent: 'INDUSTRY_CONCEPT', answer: null }; // Will use LLM
  }
  
  // Unknown intent
  return { intent: 'OUT_OF_SCOPE', answer: OUT_OF_SCOPE_REFUSAL };
}

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

// =====================================
// INTENT CLASSIFICATION SYSTEM
// =====================================

function classifyIntent(question) {
  return classifyQuestionIntent(question);
}

function getPredefinedResponse(question) {
  const classification = classifyQuestionIntent(question);
  return classification?.answer || null;
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

// =====================================
// PYTHON-STYLE PROMPT BUILDER
// =====================================

function buildPrompt(userQuestion) {
  return `You are a highly accurate Texas Oil and Gas expert assistant for the Mineral View website.

Your job has TWO steps:

STEP 1 — Classify the user question into ONE intent:

GREETING
INDUSTRY_CONCEPT
REALTIME_DATA
MINERAL_VIEW_SUPPORT
OUT_OF_SCOPE

STEP 2 — Respond STRICTLY in this JSON format:

{
"intent": "GREETING or INDUSTRY_CONCEPT or REALTIME_DATA or MINERAL_VIEW_SUPPORT or OUT_OF_SCOPE",
"answer": "your answer here"
}

INTENT DEFINITIONS:

GREETING:
User greetings or casual friendly interaction.

INDUSTRY_CONCEPT:
Texas oil and gas concepts, BOE, BBL, MCF, EUR, leases, wells, operators, API numbers, drilling permits, completion records, Texas Railroad Commission regulations.

REALTIME_DATA:
Requests for current or live data.

MINERAL_VIEW_SUPPORT:
Questions about Mineral View website.

OUT_OF_SCOPE:
Anything unrelated.

STRICT ANSWER RULES:

If GREETING:
answer EXACTLY:
"Hello! How may I help you with Texas oil and gas concepts today?"

If INDUSTRY_CONCEPT:
• Maximum 2 sentences
• Maximum 30 words
• Clear, factual, professional
• Friendly tone
• Use Texas Railroad Commission terminology when relevant
• Never hallucinate lease or operator specific facts

If REALTIME_DATA:
answer EXACTLY:
"${REALTIME_REFUSAL}"

If MINERAL_VIEW_SUPPORT:
answer EXACTLY:
"${MINERAL_VIEW_SUPPORT}"

If OUT_OF_SCOPE:
answer EXACTLY:
"${OUT_OF_SCOPE_REFUSAL}"

IMPORTANT:
• Do NOT hallucinate unknown lease/operator details
• If unknown, say you don't have specific information
• Do NOT repeat identical answers
• Ignore meaningless input
• Only return valid JSON

Question: ${userQuestion}`;
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

  // Step 1: Check for predefined fast responses (instant ~50ms)
  const classification = classifyQuestionIntent(userQuestion);
  if (classification && classification.answer) {
    return classification.answer;
  }

  // Step 2: Check cache (near-instant ~100ms)
  const cachedResponse = getFromCache(userQuestion);
  if (cachedResponse) {
    return cachedResponse;
  }

  // Step 3: Only use LLM for INDUSTRY_CONCEPT questions without predefined answers
  if (classification?.intent !== 'INDUSTRY_CONCEPT') {
    return OUT_OF_SCOPE_REFUSAL;
  }

  // Use full prompt like Python version for better accuracy
  const prompt = buildPrompt(userQuestion);

  const payload = {
    model: MODEL_NAME,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.1,
      top_p: 0.9,
      repeat_penalty: 1.2, // Same as Python version
      num_predict: 120,     // Same as Python version
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
    return SERVICE_DOWN_MESSAGE;
  }
}

// =====================================
// SMART FALLBACK SYSTEM
// =====================================

// =====================================
// MEMORY CONTEXT BUILDER (PYTHON VERSION LOGIC)
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
// ASK WITH MEMORY (PYTHON VERSION LOGIC)
// =====================================

async function askChatbotWithMemory(userQuestion) {
  const contextualQuestion = buildContextualQuestion(userQuestion);

  let answer = await askChatbot(contextualQuestion);

  // Python-style lease/operator detection with fallback
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
