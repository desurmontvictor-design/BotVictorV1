import express from "express";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// === ENV ===
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY;
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE;

const OKX_BASE_URL = "https://www.okx.com";

// === UTIL : signature OKX ===
import crypto from "crypto";

function sign(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function okxRequest(method, endpoint, body = "") {
  const timestamp = new Date().toISOString();
  const signStr = timestamp + method.toUpperCase() + endpoint + (body ? JSON.stringify(body) : "");
  const signature = sign(signStr, OKX_SECRET_KEY);

  return axios({
    url: OKX_BASE_URL + endpoint,
    method,
    headers: {
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      "Content-Type": "application/json",
    },
    data: body ? JSON.stringify(body) : undefined,
  });
}

// === ROUTE TEST ===
app.get("/", (req, res) => {
  res.send("BotVictorV1 Auto Trading + IA 🚀");
});

// === AUTO-ANALYSE BTC ===
async function analyseBTC() {
  try {
    const r = await axios.get("https://api.binance.com/api/v3/ticker/price?symbol=BTCEUR");
    const price = parseFloat(r.data.price);

    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Tu es un bot de trading. 
Prix actuel BTC/EUR : ${price}.
Analyse RSI, tendance, momentum.
Décide UNIQUEMENT : "LONG", "SHORT" ou "WAIT".
Répond juste par le mot.
        `,
      },
      { headers: { Authorization: `Bearer ${OPENAI_KEY}` } }
    );

    return ai.data.output_text.trim().toUpperCase();
  } catch (err) {
    console.log("Erreur analyse :", err.response?.data || err);
    return "WAIT";
  }
}

// === EXECUTION TRADE ===
async function tradeBTC(direction) {
  try {
    const body = {
      instId: "BTC-EUR",
      tdMode: "cash",
      side: direction === "LONG" ? "buy" : "sell",
      ordType: "market",
      sz: "0.0001",
    };

    await okxRequest("POST", "/api/v5/trade/order", body);
    return true;
  } catch (err) {
    console.log("Erreur trade :", err.response?.data || err);
    return false;
  }
}

// === WEBHOOK TELEGRAM ===
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const msg = req.body.message;
  if (!msg) return res.sendStatus(200);

  const chatId = msg.chat.id;
  const userText = msg.text || "";

  if (userText === "🪙") {
    const signal = await analyseBTC();
    let action = "";

    if (signal === "LONG" || signal === "SHORT") {
      await tradeBTC(signal);
      action = `📈 Action exécutée automatiquement : **${signal}**`;
    } else {
      action = "⏳ Marché incertain, j'attends un meilleur moment.";
    }

    await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text: `Analyse du marché : ${signal}\n${action}`,
      parse_mode: "Markdown",
    });

    return res.sendStatus(200);
  }

  // Réponse IA classique
  const ai = await axios.post(
    "https://api.openai.com/v1/responses",
    {
      model: "gpt-4.1-mini",
      input: userText
    },
    {
      headers: { Authorization: `Bearer ${OPENAI_KEY}` }
    }
  );

  const reply = ai.data.output_text || "Désolé j'ai pas capté 🤖";

  await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    chat_id: chatId,
    text: reply
  });

  res.sendStatus(200);
});

// === START SERVER ===
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("Bot lancé sur Render 🔥");

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;
  try {
    await axios.get(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${url}`);
    console.log("Webhook OK :", url);
  } catch (e) {
    console.log("Erreur Webhook :", e.response?.data || e);
  }
});
