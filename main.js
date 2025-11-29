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
const SYMBOL = "BTC-USDT";        // Spot
const AGGRESSIVE_PCT = 0.10;      // 10% du capital USDT

// ==============================
// 🧩 SIGNATURE OKX (V5)
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
      // 🔴 TRÈS IMPORTANT : DEMO TRADING
      "x-simulated-trading": "1"
    },
    data: payload
  });
}

// ==============================
// 💰 BALANCE USDT DISPONIBLE
// ==============================
async function getUsdtBalance() {
  try {
    const r = await okxRequest(
      "GET",
      "/api/v5/account/balance?ccy=USDT"
    );

    const details = r.data?.data?.[0]?.details?.[0];
    const availBal = details ? parseFloat(details.availBal) : 0;

    return availBal || 0;
  } catch (e) {
    console.log("Erreur balance USDT :", e.response?.data || e);
    return 0;
  }
}

// ==============================
// 🧠 ANALYSE IA + CONFIANCE
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

    // IA DECISION
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: `
Analyse le Bitcoin pour du trading spot agressif (scalping / court terme).
Données :
- Prix BTC : ${price} USDT (~${priceEUR} EUR)

Donne UNIQUEMENT :
DIRECTION: LONG ou SHORT
CONFIANCE: nombre entre 0 et 100 (entier)

Exemple de réponse:
DIRECTION: LONG
CONFIANCE: 73
        `.trim()
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
      txt.match(/CONFIANCE:\s*(\d+)/i)?.[1] || "50",
      10
    );

    return { direction, confiance, price, priceEUR };
  } catch (e) {
    console.log("Erreur analyse IA :", e.response?.data || e);
    // Valeurs par défaut si l'IA bug
    return { direction: "LONG", confiance: 50, price: 0, priceEUR: 0 };
  }
}

// ==============================
// 🛒 TRADE SPOT BTC/USDT (MARKET)
// ==============================
async function placeSpotTrade(direction, price) {
  try {
    // 1) Récupérer le capital USDT
    const usdt = await getUsdtBalance();

    if (!usdt || usdt <= 0) {
      return { ok: false, reason: "Pas de capital USDT dispo." };
    }

    // 2) Taille agressive : 10% du capital
    const notional = usdt * AGGRESSIVE_PCT; // en USDT

    // On évite les ordres ridicules
    if (notional < 10) {
      return {
        ok: false,
        reason: `Capital trop faible pour trade agressif (10% = ${notional.toFixed(
          2
        )} USDT)`
      };
    }

    // 3) Convertir en BTC (quantité)
    const qtyBTC = price > 0 ? notional / price : 0;
    if (qtyBTC <= 0) {
      return { ok: false, reason: "Prix invalide pour calculer la taille." };
    }

    const side = direction === "LONG" ? "buy" : "sell";

    const body = {
      instId: SYMBOL,       // BTC-USDT
      tdMode: "cash",       // Spot
      side,                 // buy / sell
      ordType: "market",    // Market
      sz: qtyBTC.toFixed(6) // quantité en BTC
    };

    const r = await okxRequest("POST", "/api/v5/trade/order", body);

    const code = r.data?.code;
    const msg = r.data?.msg;
    const ordId = r.data?.data?.[0]?.ordId || null;

    if (code === "0") {
      return { ok: true, ordId, raw: r.data, notional, qtyBTC };
    } else {
      return { ok: false, reason: `OKX code=${code} msg=${msg}` };
    }
  } catch (e) {
    console.log("Erreur placeSpotTrade :", e.response?.data || e);
    return { ok: false, reason: "Erreur réseau / API OKX" };
  }
}

// ==============================
// 📨 ENVOI TELEGRAM
// ==============================
async function sendTG(chatId, text) {
  await axios.post(
    `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`,
    {
      chat_id: chatId,
      text,
      parse_mode: "Markdown"
    }
  );
}

// ==============================
// ✅ ROUTE TEST
// ==============================
app.get("/", (req, res) => {
  res.send("BotVictorV1 Spot BTC/USDT + IA + OKX DEMO ✅");
});

// ==============================
// 🤖 WEBHOOK TELEGRAM
// ==============================
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const message = req.body.message;
  if (!message) return res.sendStatus(200);

  const chatId = message.chat.id;
  const text = message.text || "";

  try {
    // 🪙 = TRADE AUTO AGRESSIF
    if (text === "🪙") {
      await sendTG(
        chatId,
        "⏳ *Analyse du marché BTC...*\nJe regarde le prix et je calcule un signal."
      );

      const { direction, confiance, price, priceEUR } = await getSignal();

      if (!price || price <= 0) {
        await sendTG(
          chatId,
          "❌ Impossible de récupérer un prix BTC valide, je ne trade pas."
        );
        return res.sendStatus(200);
      }

      // 🔥 Mode agressif : on trade si confiance >= 45
      if (confiance >= 45) {
        const trade = await placeSpotTrade(direction, price);

        if (trade.ok) {
          const notional = trade.notional;
          const qty = trade.qtyBTC;

          const msg =
            `🚀 *TRADE SPOT EXÉCUTÉ*\n\n` +
            `📈 Pair : *${SYMBOL}*\n` +
            `🎯 Direction : *${direction}*\n` +
            `📊 Confiance IA : *${confiance}%*\n\n` +
            `💰 Taille : *${qty.toFixed(6)} BTC* (~*${notional.toFixed(
              2
            )} USDT* ≈ *${(notional * (priceEUR / price)).toFixed(2)} €*)\n` +
            `💵 Prix du BTC : *${price.toFixed(2)} USDT* (~*${priceEUR.toFixed(
              2
            )} €*)\n\n` +
            `🎯 TP théorique : *+0,30%*\n` +
            `🛑 SL théorique : *-0,20%*\n\n` +
            `🧪 Mode : *OKX DEMO Spot Agressif*\n` +
            `🆔 Ordre OKX : \`${trade.ordId}\``;

          await sendTG(chatId, msg);
        } else {
          await sendTG(
            chatId,
            `⚠️ *Tentative de trade échouée*\nRaison : ${trade.reason}`
          );
        }
      } else {
        await sendTG(
          chatId,
          `⚠️ *Marché jugé trop instable par l'IA*\nConfiance : *${confiance}%* (< 45%)\nJe protège ton capital, pas de trade.`
        );
      }

      return res.sendStatus(200);
    }

    // Sinon : discussion IA normale
    const ai = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: text
      },
      {
        headers: { Authorization: `Bearer ${OPENAI_KEY}` }
      }
    );

    await sendTG(chatId, ai.data.output_text || "🤖 J'ai pas capté.");

    res.sendStatus(200);
  } catch (err) {
    console.log("Erreur Webhook TG :", err.response?.data || err);
    res.sendStatus(500);
  }
});

// ==============================
// 🚀 START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;
app.listen(PORT, async () => {
  console.log("🔥 BotVictorV1 Spot agressif lancé sur Render - PORT:", PORT);

  const webhookUrl = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;

  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${webhookUrl}`
    );
    console.log("Webhook Telegram activé :", r.data);
  } catch (err) {
    console.log("Erreur setWebhook TG :", err.response?.data || err);
  }
});
