import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// === CONFIG ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

// === TEST ROUTE ===
app.get("/", (req, res) => {
  res.send("BotVictorV1 + IA + OKX + EMOJIS fonctionne 👑");
});

// === OKX PRICE FUNCTION ===
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

// === AI FUNCTION ===
async function askAI(prompt) {
  try {
    const aiResponse = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: prompt
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    return (
      aiResponse.data?.output?.[0]?.content?.[0]?.text ||
      "Désolé, je n'ai pas compris 🤖"
    );
  } catch (err) {
    console.log("Erreur OpenAI :", err.response?.data || err);
    return "Erreur IA 😢";
  }
}

// === WEBHOOK ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (message) {
      const chatId = message.chat.id;
      const userText = message.text || "";

      // ===============================
      //         EMOJIS COMMANDES
      // ===============================

      // 🪙 Prix BTC
      if (userText === "🪙") {
        const p = await getOkxPrice("BTC-USDT");
        if (!p) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            { chat_id: chatId, text: "Impossible d'obtenir le prix 😢" }
          );
          return res.sendStatus(200);
        }

        const msg =
          `🪙 *BTC-USDT*\n` +
          `Dernier prix : *${p.last}*\n` +
          `24h Haut : ${p.high}\n` +
          `24h Bas : ${p.low}\n` +
          `Variation : *${p.change}%*\n` +
          `Volume : ${p.vol}`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: chatId, text: msg, parse_mode: "Markdown" }
        );
        return res.sendStatus(200);
      }

      // 📈 Analyse IA marché
      if (userText === "📈") {
        const answer = await askAI(
          "Analyse complète du marché crypto avec les tendances principales, en mode simple et utile."
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: chatId, text: answer }
        );
        return res.sendStatus(200);
      }

      // 📊 Analyse technique simple
      if (userText === "📊") {
        const answer = await askAI(
          "Donne-moi une analyse technique simple et claire (RSI, MACD, EMA) pour Bitcoin."
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: chatId, text: answer }
        );
        return res.sendStatus(200);
      }

      // 🔥 Opportunité
      if (userText === "🔥") {
        const answer = await askAI(
          "Analyse le marché crypto et donne-moi une opportunité de trade potentielle, courte et précise."
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: chatId, text: answer }
        );
        return res.sendStatus(200);
      }

      // 🧠 Stratégie recommandée
      if (userText === "🧠") {
        const answer = await askAI(
          "Donne-moi une stratégie de trading simple et efficace adaptée au marché actuel."
        );
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          { chat_id: chatId, text: answer }
        );
        return res.sendStatus(200);
      }

      // 🤖 Mode conversation IA
      if (userText === "🤖") {
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: "Mode IA activé 🤖\nParle-moi :)"
          }
        );
        return res.sendStatus(200);
      }

      // ===================================
      //       Mode IA par défaut
      // ===================================
      const aiReply = await askAI(userText);

      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        { chat_id: chatId, text: aiReply }
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
