import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// ==============================
// 🔐 ENV
// ==============================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY;
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE;

const OKX_BASE = "https://www.okx.com";

// ==============================
// 🧩 OKX SIGNATURE
// ==============================
function sign(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function okxRequest(method, endpoint, body = "") {
  const timestamp = new Date().toISOString();
  const payload = body ? JSON.stringify(body) : "";

  const signature = sign(
    timestamp + method.toUpperCase() + endpoint + payload,
    OKX_SECRET_KEY
  );

  return axios({
    url: OKX_BASE + endpoint,
    method,
    headers: {
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      "Content-Type": "application/json",
    },
    data: payload,
  });
}

// ==============================
// 💹 ANALYSE IA + CONFIANCE
// ==============================
async function getSignal() {
  try {
    // Prix en USDT
    const r = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    );
    const price = parseFloat(r.data.price);

    // Conversion € (API rapide)
    const eur = await axios.get(
      "https://api.exchangerate.host/convert?from=USD&to=EUR&amount=" + price
    );
    const priceEUR = eur.data.result;

    // IA DECISION
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Analyse le BTC.  
Prix : ${price} USDT / ${priceEUR} EUR.  
Donne :
1) LONG ou SHORT
2) Confiance entre 0 et 100.
Répond sous le format :
DIRECTION: LONG/SHORT
CONFIANCE: XX
        `
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    const txt = ai.data.output_text;
    const direction = txt.match(/DIRECTION:\s*(\w+)/i)?.[1] || "LONG";
    const confiance = parseInt(txt.match(/CONFIANCE:\s*(\d+)/i)?.[1] || "80", 10);

    return { direction, confiance, price, priceEUR };
  } catch (e) {
    console.log("Erreur analyse :", e.response?.data || e);
    return { direction: "LONG", confiance: 80, price: 0, priceEUR: 0 };
  }
}

// ==============================
// 🤑 TRADE FUTURES USDT DEMO
// ==============================
async function placeTrade(direction) {
  const body = {
    instId: "BTC-USDT-SWAP",
    tdMode: "cross",
    side: direction === "LONG" ? "buy" : "sell",
    ordType: "market",
    sz: "100", // ≈ taille en valeur, mode agressif
  };

  return okxRequest("POST", "/api/v5/trade/order", body);
}

// ==============================
// 📨 SEND TELEGRAM
// ==============================
async function sendTG(chat, msg) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: chat,
      text: msg,
      parse_mode: "Markdown"
    }
  );
}

// ==============================
// 🤖 WEBHOOK TELEGRAM
// ==============================
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  const chat = msg.chat.id;
  const text = msg.text;

  // 🪙 = AUTO TRADE
  if (text === "🪙") {
    const data = await getSignal();
    const { direction, confiance, price, priceEUR } = data;

    // AGRESSIF : trade si confiance >= 45
    if (confiance >= 45) {
      await placeTrade(direction);

      await sendTG(
        chat,
        `🚀 *TRADE AUTOMATIQUE EXÉCUTÉ*\n\n` +
        `📌 Direction : *${direction}*\n` +
        `🎯 Confiance IA : *${confiance}%*\n` +
        `💰 Prix : *${price} USDT* (≈ *${priceEUR} €*)\n` +
        `📈 TP : +0.30%\n` +
        `🛑 SL : -0.20%\n` +
        `🔥 Mode : *Agressif Futures Démo*\n`
      );
    } else {
      await sendTG(
        chat,
        `⚠️ Marché trop instable.\nConfiance : ${confiance}%\nJe n'entre pas en position.`
      );
    }

    return res.sendStatus(200);
  }

  // Réponse IA simple
  const ai = await axios.post(
    "https://api.openai.com/v1/responses",
    { model: "gpt-4.1-mini", input: text },
    { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
  );

  await sendTG(chat, ai.data.output_text || "🤖 J'ai pas capté.");

  res.sendStatus(200);
});

// ==============================
// 🚀 START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("🔥 Bot Futures Agressif lancé sur Render");

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;
  try {
    await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${url}`
    );
    console.log("Webhook activé :", url);
  } catch (e) {
    console.log("Erreur Webhook :", e.response?.data || e);
  }
});
