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
  res.send("BotVictorV1 · BTC · IA · OKX · Emojis 👑");
});

// === OKX : TICKER BTC-USDT ===
async function getBtcTicker() {
  try {
    const response = await axios.get(
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
    );

    const data = response.data?.data?.[0];
    if (!data) return null;

    const last = parseFloat(data.last);
    const open = parseFloat(data.sodUtc0Price || data.open24h || last);
    const changePct =
      open > 0 ? (((last - open) / open) * 100).toFixed(2) : "0.00";

    return {
      last: last.toLocaleString("en-US", { maximumFractionDigits: 2 }),
      high: parseFloat(data.high24h).toLocaleString("en-US", { maximumFractionDigits: 2 }),
      low: parseFloat(data.low24h).toLocaleString("en-US", { maximumFractionDigits: 2 }),
      vol: parseFloat(data.vol24h).toLocaleString("en-US", { maximumFractionDigits: 2 }),
      change: changePct
    };
  } catch (err) {
    console.log("Erreur OKX :", err.response?.data || err);
    return null;
  }
}

// === IA HELPER ===
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

    const text =
      aiResponse.data?.output?.[0]?.content?.[0]?.text ||
      "Désolé, je n'ai pas compris 🤖";

    return text;
  } catch (err) {
    console.log("Erreur OpenAI :", err.response?.data || err);
    return "Erreur IA 😢";
  }
}

// === WEBHOOK TELEGRAM ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  try {
    const message = req.body.message;

    if (message) {
      const chatId = message.chat.id;
      const userText = (message.text || "").trim();

      // ===============================
      //       COMMANDES EMOJI BTC
      // ===============================

      // 🪙 — Prix instantané BTC
      if (userText === "🪙") {
        const t = await getBtcTicker();
        if (!t) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: "Impossible d'obtenir le prix BTC pour le moment 😢"
            }
          );
          return res.sendStatus(200);
        }

        const msg =
          `🪙 *Bitcoin — Prix instantané*\n` +
          `💰 *${t.last}$*\n\n` +
          `📉 24h : *${t.change}%*\n` +
          `📌 High : ${t.high}$\n` +
          `📌 Low  : ${t.low}$\n\n` +
          `⏳ Données mises à jour à l'instant (OKX)`;

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

      // 📈 — Analyse premium BTC (OKX + IA)
      if (userText === "📈") {
        const t = await getBtcTicker();
        if (!t) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: "Impossible d'obtenir les données BTC 😢"
            }
          );
          return res.sendStatus(200);
        }

        const baseMsg =
          `👑 *BTC — LIVE*\n` +
          `💰 Prix : *${t.last}$*\n` +
          `📉 24h : *${t.change}%*\n` +
          `📊 Volume : ${t.vol}\n` +
          `📌 High : ${t.high}$\n` +
          `📌 Low  : ${t.low}$\n\n` +
          `⏳ Données actualisées en temps réel (OKX)\n\n`;

        const aiText = await askAI(
          `Fais une mini analyse de marché sur Bitcoin (BTC) avec un ton simple, clair et utile. Pas de dates précises, juste une lecture du contexte possible.`
        );

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: baseMsg + aiText,
            parse_mode: "Markdown"
          }
        );
        return res.sendStatus(200);
      }

      // 📊 — Market overview BTC seulement
      if (userText === "📊") {
        const t = await getBtcTicker();
        if (!t) {
          await axios.post(
            `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
            {
              chat_id: chatId,
              text: "Impossible d'obtenir l'overview BTC 😢"
            }
          );
          return res.sendStatus(200);
        }

        const msg =
          `✨ *Marché Bitcoin — LIVE*\n` +
          `BTC : *${t.last}$* · *${t.change}%*\n\n` +
          `📌 High 24h : ${t.high}$\n` +
          `📌 Low  24h : ${t.low}$\n` +
          `📊 Volume 24h : ${t.vol}\n\n` +
          `🔗 Source : OKX (données temps réel)`;

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

      // 📉 — Sentiment BTC (IA, sans dates)
      if (userText === "📉") {
        const aiText = await askAI(
          "Donne un ressenti simple et clair sur le marché Bitcoin en général, sans parler de dates précises. Parle juste des comportements possibles (peur, euphorie, neutralité)."
        );

        const msg =
          `💎 *Sentiment du marché BTC*\n\n` +
          `${aiText}\n\n` +
          `⏳ Analyse générée par IA (sans date précise).`;

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

      // 🔥 — Opportunité du moment (BTC)
      if (userText === "🔥") {
        const t = await getBtcTicker();
        const aiText = await askAI(
          "Donne une idée d'opportunité de trade simple sur Bitcoin (BTC), en restant prudent, sans donner de conseil financier direct. Style mentor, court et clair."
        );

        const header = t
          ? `🔥 *Opportunité BTC (info prix actuelle : ~${t.last}$)*\n\n`
          : `🔥 *Opportunité BTC*\n\n`;

        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text: header + aiText,
            parse_mode: "Markdown"
          }
        );
        return res.sendStatus(200);
      }

      // 🧠 — Stratégie premium BTC
      if (userText === "🧠") {
        const aiText = await askAI(
          "Propose une stratégie de trading simple et disciplinée sur Bitcoin pour un trader débutant/intermédiaire. Pas de promesse de gains, juste de la structure."
        );

        const msg =
          `🧠 *Stratégie premium BTC*\n\n` +
          `${aiText}`;

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

      // 🤖 — Mode discussion IA
      if (userText === "🤖") {
        await axios.post(
          `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
          {
            chat_id: chatId,
            text:
              "🤖 Mode IA activé.\nParle-moi de Bitcoin, trading, mindset, ce que tu veux 👑"
          }
        );
        return res.sendStatus(200);
      }

      // 📘 — Explications pédagogiques
      if (userText.startsWith("📘")) {
        const topic = userText.replace("📘", "").trim() || "bitcoin";
        const aiText = await askAI(
          `Explique en mode simple et pédagogique : ${topic}.`
        );

        const msg =
          `📘 *Explication IA — ${topic}*\n\n` +
          `${aiText}`;

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

      // === MODE PAR DÉFAUT : IA CLASSIQUE ===
      const aiReply = await askAI(userText);
      await axios.post(
        `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
        {
          chat_id: chatId,
          text: aiReply
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
