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
// 🧩 SIGNATURE OKX (V5)
// ==============================
function sign(message) {
  return crypto.createHmac("sha256", OKX_SECRET_KEY)
    .update(message)
    .digest("base64");
}

async function okxRequest(method, endpoint, body) {
  const timestamp = new Date().toISOString();
  const payload = body ? JSON.stringify(body) : "";
  const prehash = timestamp + method.toUpperCase() + endpoint + payload;
  const signature = sign(prehash);

  return axios({
    url: OKX_BASE + endpoint,
    method,
    headers: {
      "OK-ACCESS-KEY": OKX_API_KEY,
      "OK-ACCESS-SIGN": signature,
      "OK-ACCESS-TIMESTAMP": timestamp,
      "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
      // Très important : clé reconnue comme DÉMO
      "x-simulated-trading": "1",
      "Content-Type": "application/json"
    },
    data: payload || undefined
  });
}

// ==============================
// 📈 PRIX BTC/USDT (OKX) + EUR
// ==============================
async function getMarketData() {
  try {
    const r = await axios.get(
      "https://www.okx.com/api/v5/market/ticker?instId=BTC-USDT"
    );

    const ticker = r.data?.data?.[0];
    const priceUSD = ticker ? parseFloat(ticker.last) : 0;

    let priceEUR = 0;

    if (priceUSD > 0) {
      try {
        const eur = await axios.get(
          "https://api.exchangerate.host/convert",
          {
            params: { from: "USD", to: "EUR", amount: priceUSD }
          }
        );
        if (eur.data && typeof eur.data.result === "number") {
          priceEUR = eur.data.result;
        } else {
          priceEUR = priceUSD * 0.9; // fallback approx
        }
      } catch (e) {
        console.log("Erreur conversion EUR :", e.response?.data || e.message);
        priceEUR = priceUSD * 0.9; // fallback approx
      }
    }

    return { priceUSD, priceEUR };
  } catch (e) {
    console.log("Erreur market data OKX :", e.response?.data || e.message);
    return { priceUSD: 0, priceEUR: 0 };
  }
}

// ==============================
// 🤖 SIGNAL IA (direction + confiance)
// ==============================
async function getSignal() {
  const { priceUSD, priceEUR } = await getMarketData();

  try {
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Tu es un trader crypto agressif mais pas suicidaire.
Analyse uniquement le BTC/USDT en SPOT, sur une vision court terme.

Prix actuel : ${priceUSD} USDT (~${priceEUR} EUR).

Réponds STRICTEMENT dans ce format (en français) :

DIRECTION: LONG ou SHORT
CONFIANCE: nombre entre 0 et 100
RAISON: une phrase très courte
        `
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const txt = ai.data.output_text || "";
    const dirMatch = txt.match(/DIRECTION:\s*(LONG|SHORT)/i);
    const confMatch = txt.match(/CONFIANCE:\s*(\d+)/i);
    const raisonMatch = txt.match(/RAISON:\s*(.+)/i);

    const direction = (dirMatch && dirMatch[1].toUpperCase()) || "LONG";
    const confiance = confMatch ? parseInt(confMatch[1], 10) : 50;
    const raison = raisonMatch ? raisonMatch[1].trim() : "Analyse rapide.";

    return { direction, confiance, priceUSD, priceEUR, raison, raw: txt };
  } catch (e) {
    console.log("Erreur OpenAI signal :", e.response?.data || e.message);
    return {
      direction: "LONG",
      confiance: 50,
      priceUSD,
      priceEUR,
      raison: "Fallback après erreur IA.",
      raw: ""
    };
  }
}

// ==============================
// 🪙 ORDRE SPOT BTC/USDT (DÉMO)
// ==============================
async function placeSpotOrder(direction) {
  // En SPOT sans marge, on ne peut pas vraiment shorter.
  const side = direction === "LONG" ? "buy" : "sell";

  if (side === "sell") {
    return {
      simulated: true,
      note: "Pas de short possible en SPOT démo, trade ignoré."
    };
  }

  const body = {
    instId: "BTC-USDT",
    tdMode: "cash",     // SPOT
    side,               // buy
    ordType: "market",  // au marché
    sz: "0.001"         // 0.001 BTC pour tester
  };

  try {
    const r = await okxRequest("POST", "/api/v5/trade/order", body);
    return r.data;
  } catch (e) {
    console.log("Erreur OKX spot :", e.response?.data || e.message);
    return { error: e.response?.data || e.message };
  }
}

// ==============================
// ✉️ TELEGRAM
// ==============================
async function sendTG(chatId, text) {
  try {
    await axios.post(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "Markdown"
      }
    );
  } catch (e) {
    console.log("Erreur Telegram :", e.response?.data || e.message);
  }
}

// ==============================
// 🔔 WEBHOOK TELEGRAM
// ==============================
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text || "";

  // 🪙 = auto-trade
  if (text === "🪙") {
    const { direction, confiance, priceUSD, priceEUR, raison } =
      await getSignal();

    let result;
    let actionText;

    if (confiance >= 40) {
      result = await placeSpotOrder(direction);

      if (result?.simulated) {
        actionText = "❌ Pas de short possible en SPOT démo, trade ignoré.";
      } else if (result?.error) {
        actionText = `⚠️ Erreur OKX : \`${JSON.stringify(result.error)}\``;
      } else {
        const ord = result?.data?.[0] || {};
        actionText =
          "✅ Ordre SPOT envoyé sur OKX (démo).\n" +
          `• id: \`${ord.ordId || "inconnu"}\`\n` +
          `• état: \`${ord.state || "unknown"}\``;
      }
    } else {
      actionText =
        "⚠️ Confiance trop faible, je préfère rester hors marché.";
    }

    const safeUSD = Number(priceUSD || 0);
    const safeEUR = Number(priceEUR || 0);

    const tp = safeUSD ? (safeUSD * 1.003).toFixed(2) : "—";
    const sl = safeUSD ? (safeUSD * 0.998).toFixed(2) : "—";

    const msg =
      `🚀 *TRADE SPOT BTC/USDT (Démo)*\n\n` +
      `🎯 Direction IA : *${direction}*\n` +
      `📊 Confiance : *${confiance}%*\n` +
      `💬 Raison : _${raison}_\n\n` +
      `💰 Prix approx : *${safeUSD} USDT* (≈ *${safeEUR.toFixed(2)} €*)\n` +
      `🎯 TP indicatif : *${tp} USDT*\n` +
      `🛑 SL indicatif : *${sl} USDT*\n\n` +
      `${actionText}`;

    await sendTG(chatId, msg);
    return res.sendStatus(200);
  }

  // Sinon : chat IA normal
  try {
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: text
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const reply = ai.data.output_text || "🤖 Je n'ai pas compris.";
    await sendTG(chatId, reply);
  } catch (e) {
    console.log("Erreur OpenAI chat :", e.response?.data || e.message);
    await sendTG(chatId, "🤖 Erreur IA, réessaie dans 1 minute.");
  }

  res.sendStatus(200);
});

// ==============================
// ✅ HEALTHCHECK
// ==============================
app.get("/", (req, res) => {
  res.send("BotVictorV1 SPOT démo OKX + Telegram + IA ✅");
});

// ==============================
> START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("🔥 BotVictorV1 Spot démo lancé sur Render – PORT:", PORT);

  const webhookUrl = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;
  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`,
      { params: { url: webhookUrl } }
    );
    console.log("Webhook Telegram activé :", r.data);
  } catch (e) {
    console.log(
      "Erreur setWebhook Telegram :",
      e.response?.data || e.message
    );
  }
});
