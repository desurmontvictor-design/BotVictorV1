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
      // ⚠️ TRÈS IMPORTANT : DEMO TRADING
      "x-simulated-trading": "1"
    },
    data: payload
  });
}

// ==============================
// 💹 ANALYSE IA + CONFIANCE
// ==============================
async function getSignal() {
  try {
    // Prix BTC en USDT (Binance)
    const r = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    );
    const price = parseFloat(r.data.price);

    // Conversion en €
    const eur = await axios.get(
      "https://api.exchangerate.host/convert?from=USD&to=EUR&amount=" + price
    );
    const priceEUR = eur.data.result;

    // IA : direction + confiance
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Analyse le Bitcoin pour du trading FUTURES agressif.
Prix : ${price} USDT / ${priceEUR} EUR.

Donne UNIQUEMENT :
DIRECTION: LONG ou SHORT
CONFIANCE: nombre entre 0 et 100
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
    const direction = txt.match(/DIRECTION:\s*(LONG|SHORT)/i)?.[1]?.toUpperCase() || "LONG";
    const confiance = parseInt(
      txt.match(/CONFIANCE:\s*(\d+)/i)?.[1] || "80",
      10
    );

    return { direction, confiance, price, priceEUR, rawIA: txt };
  } catch (e) {
    console.log("Erreur analyse IA :", e.response?.data || e);
    return {
      direction: "LONG",
      confiance: 50,
      price: 0,
      priceEUR: 0,
      rawIA: "Erreur IA"
    };
  }
}

// ==============================
// 🤑 TRADE FUTURES USDT DEMO
// ==============================
async function placeTrade(direction) {
  try {
    const body = {
      instId: "BTC-USDT-SWAP",   // Futures perpétuel BTC-USDT
      tdMode: "cross",           // Cross margin
      side: direction === "LONG" ? "buy" : "sell",
      ordType: "market",
      sz: "1"                    // 1 contrat (agressif mais propre)
    };

    const res = await okxRequest("POST", "/api/v5/trade/order", body);
    console.log("Réponse OKX trade :", res.data);

    return { ok: true, data: res.data, body };
  } catch (e) {
    console.log("Erreur OKX trade :", e.response?.data || e);
    return {
      ok: false,
      error: e.response?.data || String(e)
    };
  }
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
  const text = msg.text || "";

  // 🪙 = AUTO TRADE FUTURES
  if (text === "🪙") {
    const { direction, confiance, price, priceEUR, rawIA } = await getSignal();

    // Mode agressif : on trade si confiance >= 45
    if (confiance >= 45) {
      const trade = await placeTrade(direction);

      if (trade.ok && trade.data) {
        const code = trade.data.code;
        const ord = trade.data.data?.[0];

        await sendTG(
          chat,
          `✅ *TRADE FUTURES DÉMO EXÉCUTÉ*\n\n` +
          `📌 Direction : *${direction}*\n` +
          `🎯 Confiance IA : *${confiance}%*\n` +
          `💰 Prix approx : *${price} USDT* (≈ *${priceEUR.toFixed(2)} €*)\n` +
          `🧠 IA brut : \`${rawIA.replace(/`/g, "'")}\`\n\n` +
          `📊 OKX code : *${code}*\n` +
          (ord
            ? `📝 Ordre ID : \`${ord.ordId}\`\n`
            : `ℹ️ Détails ordre non renvoyés.\n`) +
          `🔥 Mode : *Futures DEMO Agressif*`
        );
      } else {
        await sendTG(
          chat,
          `❌ *ÉCHEC DU TRADE FUTURES*\n\n` +
          `📌 Direction : *${direction}*\n` +
          `🎯 Confiance IA : *${confiance}%*\n` +
          `💰 Prix approx : *${price} USDT* (≈ *${priceEUR.toFixed(2)} €*)\n\n` +
          `⚠️ Erreur OKX : \`${JSON.stringify(trade.error).slice(0, 400)}\``
        );
      }
    } else {
      await sendTG(
        chat,
        `⚠️ *Marché trop instable pour du futures agressif.*\n` +
        `Confiance IA : *${confiance}%*\n` +
        `Je préfère *ne pas entrer* en position.`
      );
    }

    return res.sendStatus(200);
  }

  // === Réponse IA "classique" pour le reste ===
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

    const reply = ai.data.output_text || "🤖 J'ai pas capté.";
    await sendTG(chat, reply);
  } catch (e) {
    console.log("Erreur IA texte :", e.response?.data || e);
    await sendTG(chat, "🤖 Erreur IA, réessaie plus tard.");
  }

  res.sendStatus(200);
});

// ==============================
// 🚀 START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("🔥 Bot Futures Agressif lancé sur Render – PORT", PORT);

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;
  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${url}`
    );
    console.log("Webhook activé :", r.data);
  } catch (e) {
    console.log("Erreur Webhook :", e.response?.data || e);
  }
});
