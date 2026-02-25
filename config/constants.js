// =====================================
// CONFIGURATION
// =====================================

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";
const OLLAMA_URL = "http://127.0.0.1:11434/api/generate";
const MODEL_NAME = "gemma3:12b";

// =====================================
// ADDITIONAL CONFIGURATION
// =====================================

const SERVICE_DOWN_MESSAGE =
  "Service is temporarily unavailable. Please try again later.";

const UNKNOWN_LEASE_MESSAGE =
  "I don't have specific information about that lease. You can check Texas Railroad Commission records or Mineral View for detailed lease data.";

const UNKNOWN_OPERATOR_MESSAGE =
  "I don't have specific information about that operator. Please refer to Texas Railroad Commission filings or Mineral View operator records.";

const INVALID_INPUT_MESSAGE =
  "Please enter a valid Texas oil and gas related question.";

const GENERIC_UNKNOWN_MESSAGE =
  "I don't have enough information to answer that specific question.";

// =====================================
// STANDARD RESPONSES
// =====================================

const OUT_OF_SCOPE_REFUSAL =
  "I'm sorry, I can only answer questions related to Texas oil and gas industry concepts.";

const REALTIME_REFUSAL =
  "I'm sorry, I don't have access to real-time Texas oil and gas data such as live counts, prices, or current activity levels.";

const MINERAL_VIEW_SUPPORT =
  "For Mineral View website related assistance, please use the Support section available on the Mineral View website or contact our team at support@mineralview.com.";

// =====================================
// SPELLING CORRECTIONS
// =====================================

const COMMON_CORRECTIONS = {
  opeartor: "operator",
  operater: "operator",
  opertor: "operator",
  leese: "lease",
  completin: "completion",
  recod: "record",
  forcast: "forecast",
  prodction: "production",
  rrc: "railroad commission of texas",
};

// =====================================
// MEMORY CONFIG
// =====================================

const MAX_MEMORY_TURNS = 3;

module.exports = {
  OLLAMA_BASE_URL,
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
};
