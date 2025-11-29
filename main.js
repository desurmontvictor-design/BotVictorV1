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

// MODE DEMO
const OKX_BASE = "https://www.okx.com";

// ==============================
// 🧩 SIGNATURE OKX
// ==============================
function sign(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function okxRequest(method, endpoint, body = "") {
  try {
    const timestamp = new Date().toISOString();
    const payload = body ? JSON.stringify(body) : "";

    const signature = sign(
      timestamp + method.toUpperCase() + endpoint + payload,
      OKX_SECRET_KEY
    );

    const res = await axios({
      url: OKX_BASE + endpoint,
      method,
      headers: {
        "OK-ACCESS-KEY": OKX_API_KEY,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
        "x-simulated-trading": "1", // 🔥 MODE DEMO ACTIVÉ
        "Content-Type": "application/json",
      },
      data: payload,
    });

    return res.data;
  } catch (e) {
    console.log("Erreur OKX :", e.response?.data || e);
    return null;
  }
}

// ==============================
// 💹 ANALYSE IA + PARSING ROBUSTE
// ==============================
async function getSignal() {
  try {
    const r = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    );
    const price = parseFloat(r.data.price);

    const eur = await axios.get(
      `https://api.exchangerate.host/convert?from=USD&to=EUR&amount=${price}`
    );
    const priceEUR = eur.data.result;

    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Analyse BTC.
Prix : ${price} USDT / ${priceEUR} EUR.
Donne une décision simple :

DIRECTION: LONG ou SHORT
CONFIANCE: un nombre entre 0 et 100
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

    const direction = txt.match(/DIRECTION:\s*(LONG|SHORT)/i)?.[1] || "LONG";
    const confiance = parseInt(
      txt.match(/CONFIANCE:\s*(\d+)/i)?.[1] || "80"
    );

    return { direction, confiance, price, priceEUR };

  } catch (e) {
    console.log("Erreur analyse IA:", e.response?.data || e);
    return { direction: "LONG", confiance: 50, price: 0, priceEUR: 0 };
  }
}

// ==============================
// 🤑 TRADE FUTURES DEMO
// ==============================
async function placeTrade(direction) {
  const body = {
    instId: "BTC-USDT-SWAP",
    tdMode: "cross",
    side: direction === "LONG" ? "buy" : "sell",
    ordType: "market",
    sz: "50", // agressif mais safe
  };

  return await okxRequest("POST", "/api/v5/trade/order", body);
}

// ==============================
// 📨 TELEGRAM
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

  // AUTO TRADE
  if (text === "🪙") {
    const { direction, confiance, price, priceEUR } = await getSignal();

    if (confiance >= 40) {
      const trade = await placeTrade(direction);

      await sendTG(
        chat,
        `🚀 *TRADE EXÉCUTÉ*\n\n` +
        `🟢 Direction : *${direction}*\n` +
        `📊 Confiance : *${confiance}%*\n` +
        `💰 Prix : *${price} USDT* (≈ *${priceEUR} €*)\n` +
        `🔥 Mode : *Futures DEMO Agressif*\n` +
        `📄 Résultat OKX : ${JSON.stringify(trade)}`
      );
    } else {
      await sendTG(
        chat,
        `⚠️ Marché instable.\nConfiance : ${confiance}%.\nPas de trade.`
      );
    }

    return res.sendStatus(200);
  }

  // IA normale
  const ai = await axios.post(
    "https://api.openai.com/v1/responses",
    { model: "gpt-4.1-mini", input: text },
    { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
  );

  await sendTG(chat, ai.data.output_text || "🤖 Je n'ai pas compris.");
  res.sendStatus(200);
});

// ==============================
// 🚀 START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("🔥 Bot Futures Agressif lancé");

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;
  try {
    await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${url}`
    );
    console.log("Webhook activé !");
  } catch (e) {
    console.log("Erreur Webhook:", e.response?.data || e);
  }
});
