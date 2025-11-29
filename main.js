import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// === CONFIG ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// === ROUTE TEST ===
app.get("/", (req, res) => {
  res.send("BotVictorV1 fonctionne 👑");
});

// === WEBHOOK TELEGRAM ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (message) {
      const chatId = message.chat.id;
      const text = message.text || "";

      // Réponse automatique
      await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
        chat_id: chatId,
        text: `🟣 BotVictorV1 te répond : ${text}`
      });
    }

    res.sendStatus(200);
  } catch (err) {
    console.log("Erreur Webhook:", err.response?.data || err);
    res.sendStatus(500);
  }
});

// === START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log("BotVictorV1 lancé sur Render 🔥 PORT:", PORT);

  // Active automatiquement le webhook à chaque démarrage
  axios.get(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`
  )
    .then(() => console.log("Webhook Telegram activé ✔️"))
    .catch(err => console.log("Erreur Webhook:", err.response?.data || err));
});
