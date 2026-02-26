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
// SIMPLE MEMORY STORAGE
// =====================================

const conversationMemory = [];

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

function buildPrompt(userQuestion) {
  const prompt = `
You are a highly accurate Texas Oil and Gas expert assistant for the Mineral View website.

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


Question: ${userQuestion}
`;
  return prompt;
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

  const prompt = buildPrompt(userQuestion);

  const payload = {
    model: MODEL_NAME,
    prompt: prompt,
    stream: false,
    options: {
      temperature: 0.1,
      top_p: 0.9,
      repeat_penalty: 1.2,
      num_predict: 120,
    },
  };

  try {
    const response = await axios.post(OLLAMA_URL, payload, { timeout: 120000 });

    if (response.status !== 200) {
      console.log(SERVICE_DOWN_MESSAGE)
      return SERVICE_DOWN_MESSAGE;
    }

    const rawText = response.data.response || "";
    return cleanResponse(rawText);
  } catch (e) {
    console.log(e);
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
  mviewAssistantService,
};

// =====================================
// MVIEW ASSISTANT — MONGO INSERT & POLL
// =====================================

const { getDB } = require("../config/db");
const { ObjectId } = require("mongodb");

const COLLECTION_NAME = "TexasOilAndGasAssistant";
const POLL_INTERVAL_MS = 10;   // check every 300 ms
const ANSWER_TIMEOUT_MS = 10000; // give up after 3 seconds

async function mviewAssistantService({ member_id, email, question }) {
  const db = await getDB();
  const collection = db.collection(COLLECTION_NAME);

  // Build the document to insert
  const docToInsert = {
    question: question,
    created_at: new Date(),
  };
  if (member_id) docToInsert.member_id = member_id;
  if (email) docToInsert.email = email;

  // Insert and capture the generated _id
  const insertResult = await collection.insertOne(docToInsert);
  const insertedId = insertResult.insertedId;

  // Poll for answer with a 3-second hard timeout
  return new Promise((resolve) => {
    const startTime = Date.now();

    async function checkAnswer() {
      try {
        const elapsed = Date.now() - startTime;

        if (elapsed >= ANSWER_TIMEOUT_MS) {
          return resolve({
            success: false,
            message:
              "We appreciate your patience. Unfortunately, we were unable to retrieve an answer at this time. " +
              "Our system is processing your request, but it's taking longer than expected. " +
              "Please try again in a few moments.",
          });
        }

        const doc = await collection.findOne({ _id: new ObjectId(insertedId) });

        if (doc && doc.ans !== null && doc.ans !== undefined && String(doc.ans).trim() !== "") {
          return resolve({ success: true, answer: doc.ans });
        }

        // Not ready yet — check again after POLL_INTERVAL_MS
        setTimeout(checkAnswer, POLL_INTERVAL_MS);
      } catch (err) {
        return resolve({
          success: false,
          message: "An unexpected error occurred while retrieving your answer. Please try again.",
        });
      }
    }

    checkAnswer();
  });
}
