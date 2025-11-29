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
  res.send("BotVictorV1 + IA + OKX fonctionne 👑");
});

// === FONCTION OKX : récupérer le prix ===
async function getOkxPrice(pair = "BTC-USDT") {
  try {
    const response = await axios.get(
      `https://www.okx.com/api/v5/market/ticker?instId=${pair}`
    );

    const data = response.data.data?.[0];
    if (!data) return null;

    return {
      last: data.last,
      high: data.high24h,
      low: data.low24h,
      vol: data.vol24h,
      change: data.sodUtc0Price
        ? ((data.last - data.sodUtc0Price) / data.sodUtc0Price * 100).toFixed(2)
        : "0"
    };
  } catch (err) {
    console.log("Erreur OKX :", err.response?.data || err);
    return null;
  }
}

// === ROUTE WEBHOOK ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (message) {
      const chatId = message.chat.id;
      const userText = message.text || "";

      // === COMMANDES SPÉCIALES ===
      if (userText.startsWith("/price")) {
        const pair = userText.split(" ")[1] || "BTC-USDT";
        const p = await getOkxPrice(pair);

        if (!p) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: "Impossible d'obtenir les données OKX 😢"
            }
          );
          return res.sendStatus(200);
        }

        const msg =
          `📈 *${pair}*\n` +
          `Dernier prix : *${p.last}*\n` +
          `24h Haut : ${p.high}\n` +
          `24h Bas : ${p.low}\n` +
          `Variation : *${p.change}%*\n` +
          `Volume : ${p.vol}`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: msg,
            parse_mode: "Markdown"
          }
        );

        return res.sendStatus(200);
      }

      // === IA OPENAI ===
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

      const botReply =
        aiResponse.data.output_text ||
        "Désolé, je n'ai pas compris 🤖";

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
