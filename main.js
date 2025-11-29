// ==============================
// 🚀 START SERVER + WEBHOOK
// ==============================
const PORT = process.env.PORT || 10000;

app.listen(PORT, async () => {
  console.log("🔥 BotVictorV1 Spot agressif lancé sur Render - PORT:", PORT);

  const url = `https://botvictorv1.onrender.com/webhook/${TELEGRAM_TOKEN}`;

  try {
    const r = await axios.get(
      `https://api.telegram.org/bot${TELEGRAM_TOKEN}/setWebhook?url=${url}`
    );

    console.log("Webhook Telegram activé :", r.data);
  } catch (e) {
    console.log("Erreur Webhook Telegram :", e.response?.data || e);
  }
});
