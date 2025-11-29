import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// === CONFIG ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// === ROUTE TEST ===
app.get("/", (req, res) => {
  res.send("BotVictorV1 + IA fonctionne 👑");
});

// === ROUTE WEBHOOK ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (message) {
      const chatId = message.chat.id;
      const userText = message.text || "";

      // ====== IA OPENAI ======
      const aiResponse = await axios.post(
        "https://api.openai.com/v1/chat/completions",
        {
          model: "gpt-4.1",
          messages: [
            { role: "system", content: "Tu es BotVictorV1, un bot utile et intelligent." },
            { role: "user", content: userText }
          ]
        },
        { h
