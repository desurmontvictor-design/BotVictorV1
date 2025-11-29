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

      // ===== OPENAI CALL =====
      const aiResponse = await axios.post(
        "https://api.openai.com/v1/responses",
        {
          model: "gpt-4.1-mini",
          input: userText
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_KEY}`,
            "Content-Type": "application/json"
          }
        }
      );

      // === EXTRACTION DU TEXTE ===
      let botReply = "Désolé, je n'ai pas compris 🤖";

      if (
        aiResponse.data &&
        aiResponse.data.output &&
        aiResponse.data.output[0] &&
        aiResponse.data.output[0].content &&
        aiResponse.data.output[0].content[0] &&
        aiResponse.data.output[0].content[0].text
      ) {
        botReply = aiResponse.data.output[0].content[0].text;
      }

      // === ENVOI DU MESSAGE TELEGRAM ===
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: botReply
        }
      );
    }

    res.sendStatus(200);
  } catch (err) {
    console.log("Erreur Webhook :", err.response?.data || err);
    res.sendStatus(500);
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("BotVictorV1 lancé sur Render 🔥 PORT:", PORT);

  const webhookUrl = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;

  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${webhookUrl}`
    );
    console.log("Webhook activé :", r.data);
  } catch (err) {
    console.log("Erreur setWebhook :", err.response?.data || err);
  }
});
