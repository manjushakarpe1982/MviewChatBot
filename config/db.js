// config/db.js

const { MongoClient } = require("mongodb");

const MONGO_URL =
  process.env.MONGO_URL ||
  "mongodb://admin:Staging%23Admin%21456%40Secure@108.181.168.43:27011/";

const MONGO_DB_NAME = process.env.MONGO_DB_NAME || "Mineral_View_Chatbot";

let client = null;
let dbInstance = null;

async function connectDB() {
  if (dbInstance) return dbInstance;

  client = new MongoClient(MONGO_URL, {
    connectTimeoutMS: 10000,
    serverSelectionTimeoutMS: 10000,
  });

  await client.connect();
  dbInstance = client.db(MONGO_DB_NAME);
  console.log(`MongoDB connected → ${MONGO_DB_NAME}`);
  return dbInstance;
}

async function getDB() {
  if (!dbInstance) {
    return await connectDB();
  }
  return dbInstance;
}

module.exports = { connectDB, getDB };
