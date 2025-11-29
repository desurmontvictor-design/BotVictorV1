// ==============================
// 🔧 IMPORTS & CONFIG
// ==============================
import express from "express";
import axios from "axios";
import crypto from "crypto";
import dotenv from "dotenv";
dotenv.config();

const app = express();
app.use(express.json());

// ==============================
// 🔐 VARIABLES D'ENVIRONNEMENT
// ==============================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

const OKX_API_KEY = process.env.OKX_API_KEY;
const OKX_SECRET_KEY = process.env.OKX_SECRET_KEY;
const OKX_PASSPHRASE = process.env.OKX_PASSPHRASE;

const OKX_BASE = "https://www.okx.com"; // demo + réel, on ajoute x-simulated-trading pour le mode démo

if (!TELEGRAM_TOKEN || !OPENAI_KEY) {
  console.log("❌ Il manque TELEGRAM_TOKEN ou OPENAI_API_KEY dans les variables d'environnement.");
}
if (!OKX_API_KEY || !OKX_SECRET_KEY || !OKX_PASSPHRASE) {
  console.log("❌ Il manque une variable OKX (OKX_API_KEY / OKX_SECRET_KEY / OKX_PASSPHRASE).");
}

// ==============================
// 🧮 OUTILS OKX (SIGNATURE + REQUÊTES)
// ==============================
function sign(message, secret) {
  return crypto.createHmac("sha256", secret).update(message).digest("base64");
}

async function okxRequest(method, endpoint, bodyObj = null) {
  const timestamp = new Date().toISOString();
  const body = bodyObj ? JSON.stringify(bodyObj) : "";
  const prehash = timestamp + method.toUpperCase() + endpoint + body;
  const signature = sign(prehash, OKX_SECRET_KEY);

  try {
    const res = await axios({
      url: OKX_BASE + endpoint,
      method,
      headers: {
        "OK-ACCESS-KEY": OKX_API_KEY,
        "OK-ACCESS-SIGN": signature,
        "OK-ACCESS-TIMESTAMP": timestamp,
        "OK-ACCESS-PASSPHRASE": OKX_PASSPHRASE,
        "Content-Type": "application/json",
        // 🔑 IMPORTANT pour le mode démo :
        "x-simulated-trading": "1"
      },
      data: body
    });

    return res.data;
  } catch (e) {
    console.log("❌ Erreur OKX :", e.response?.data || e.message || e);
    throw e;
  }
}

// ==============================
// 🤖 ANALYSE IA DU MARCHÉ BTC
// ==============================
async function getMarketSignal() {
  try {
    // 1️⃣ Prix BTC en USDT (Binance)
    const priceRes = await axios.get(
      "https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT"
    );
    const price = parseFloat(priceRes.data.price || "0");

    // 2️⃣ Conversion approximative en EUR
    let priceEUR = 0;
    try {
      const eurRes = await axios.get(
        "https://api.exchangerate.host/convert",
        {
          params: { from: "USD", to: "EUR", amount: price }
        }
      );
      priceEUR = parseFloat(eurRes.data?.result || "0");
    } catch (e) {
      console.log("⚠️ Erreur conversion EUR :", e.response?.data || e.message || e);
    }

    // 3️⃣ Demande à l'IA un signal direction + confiance
    const prompt = `
Analyse le marché du Bitcoin en temps réel.

Prix actuel BTC :
- ${price} USDT
- ≈ ${priceEUR} EUR

Donne-moi UNIQUEMENT :
DIRECTION: LONG ou SHORT
CONFIANCE: un nombre entre 0 et 100 (en pourcentage)

Format EXACT attendu :
DIRECTION: LONG
CONFIANCE: 72
`;

    const aiRes = await axios.post(
      "https://api.openai.com/v1/responses",
      {
        model: "gpt-4.1-mini",
        input: prompt,
      },
      {
        headers: {
          Authorization: `Bearer ${OPENAI_KEY}`,
          "Content-Type": "application/json"
        }
      }
    );

    const txt =
      aiRes.data.output_text ||
      aiRes.data.output?.[0]?.content?.[0]?.text ||
      "";

    const directionMatch = txt.match(/DIRECTION:\s*(LONG|SHORT)/i);
    const confMatch = txt.match(/CONFIANCE:\s*(\d+)/i);

    const direction = (directionMatch?.[1] || "LONG").toUpperCase();
    const confiance = parseInt(confMatch?.[1] || "50", 10);

    return {
      direction,
      confiance,
      price,
      priceEUR
    };
  } catch (e) {
    console.log("❌ Erreur analyse IA :", e.response?.data || e.message || e);
    // Valeurs par défaut en cas de bug
    return {
      direction: "LONG",
      confiance: 50,
      price: 0,
      priceEUR: 0
    };
  }
}

// ==============================
// 💰 PASSAGE D'UN TRADE SPOT BTC-USDT (DÉMO)
// ==============================
async function placeSpotTrade(direction) {
  // Trade petit pour tester : 0.001 BTC (≈ 70–80€)
  const body = {
    instId: "BTC-USDT",
    tdMode: "cash", // spot
    side: direction === "LONG" ? "buy" : "sell",
    ordType: "market",
    sz: "0.001"
  };

  const data = await okxRequest("POST", "/api/v5/trade/order", body);
  return data;
}

// ==============================
// ✉️ TELEGRAM : ENVOI DE MESSAGE
// ==============================
async function sendTelegram(chatId, text) {
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
    console.log("❌ Erreur envoi Telegram :", e.response?.data || e.message || e);
  }
}

// ==============================
// 🚦 ROUTE DE TEST HTTP
// ==============================
app.get("/", (req, res) => {
  res.send("BotVictorV1 est en ligne ✅");
});

// ==============================
// 🧵 WEBHOOK TELEGRAM
// ==============================
app.post(`/webhook/${TELEGRAM_TOKEN}`, async (req, res) => {
  const msg = req.body.message;

  if (!msg) {
    return res.sendStatus(200);
  }

  const chatId = msg.chat.id;
  const text = msg.text?.trim() || "";

  try {
    // 🪙 = DEMANDE DE TRADE AUTO
    if (text === "🪙") {
      await sendTelegram(chatId, "⏳ Analyse du marché BTC en cours...");

      const { direction, confiance, price, priceEUR } = await getMarketSignal();

      // Seuil agressif pour tester
      const seuilConfiance = 45;

      if (confiance < seuilConfiance) {
        await sendTelegram(
          chatId,
          `⚠️ *Pas de trade pris*\n\n` +
            `Confiance trop faible : *${confiance}%* (< ${seuilConfiance}%)\n` +
            `Je protège ton capital, j'attends un meilleur setup.`
        );
        return res.sendStatus(200);
      }

      // On tente un trade spot démo
      let okxResult = null;
      try {
        okxResult = await placeSpotTrade(direction);
      } catch (e) {
        const errData = e.response?.data || {};
        await sendTelegram(
          chatId,
          `❌ *Échec de l'ordre sur OKX*\n\n` +
            `Code: \`${errData.code || "inconnu"}\`\n` +
            `Message: \`${errData.msg || e.message || "Erreur inconnue"}\`\n\n` +
            `Vérifie ta clé API démo / droits de trading sur OKX.`
        );
        return res.sendStatus(200);
      }

      const priceStr = price ? price.toFixed(2) : "n/a";
      const eurStr = priceEUR ? priceEUR.toFixed(2) : "n/a";

      const okxMsg = okxResult?.data?.[0] || {};
      const ordId = okxMsg.ordId || "inconnu";
      const state = okxMsg.state || "envoyé";

      await sendTelegram(
        chatId,
        `🚀 *TRADE SPOT DÉMO EXÉCUTÉ*\n\n` +
          `📌 Pair : *BTC-USDT*\n` +
          `📈 Direction : *${direction}*\n` +
          `🎯 Confiance IA : *${confiance}%*\n\n` +
          `💰 Prix approx : *${priceStr} USDT* (≈ *${eurStr} €*)\n` +
          `📊 Taille : *0.001 BTC*\n\n` +
          `🧾 ID ordre OKX : \`${ordId}\`\n` +
          `📦 Statut OKX : \`${state}\`\n\n` +
          `⚠️ SL/TP *logiques* à coder en natif plus tard.\n` +
          `Pour l'instant : prise de position simple pour tester le flux complet.`
      );

      return res.sendStatus(200);
    }

    // Sinon : réponse IA "classique"
    const aiRes = await axios.post(
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

    const replyText =
      aiRes.data.output_text ||
      aiRes.data.output?.[0]?.content?.[0]?.text ||
      "🤖 Désolé, je n'ai pas compris.";

    await sendTelegram(chatId, replyText);
    return res.sendStatus(200);
  } catch (e) {
    console.log("❌ Erreur dans le webhook Telegram :", e.response?.data || e.message || e);
    // On répond quand même 200 à Telegram pour ne pas perdre le webhook
    return res.sendStatus(200);
  }
});

// ==============================
// 🚀 LANCEMENT DU SERVEUR + SET WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log("🔥 BotVictorV1 Spot agressif lancé sur Render - PORT:", PORT);

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;

  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook`,
      {
        params: { url }
      }
    );
    console.log("✅ Webhook Telegram activé :", r.data);
  } catch (e) {
    console.log("❌ Erreur Webhook Telegram :", e.response?.data || e.message || e);
  }
});
