const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

// Bellekte tutulan geçici cihaz ve ayar verisi (ileride MongoDB'ye bağlayacağız)
let deviceStore = {
  orbUrl: "", // SL içindeki nesnenin HTTP-in adresi
  settings: {
    mode: "lockdown",
    countdown: 10,
    action: "eject",
    minHeight: 1.20,
    maxHeight: 2.10,
    minAge: 14,
    discordWebhook: "",
    whitelist: []
  }
};

// 1. SL Nesnesinin kendini kaydettiği yer (Ping & URL Register)
app.post('/api/register-orb', (req, res) => {
  const { orbUrl, parcelName, region } = req.body;
  deviceStore.orbUrl = orbUrl;
  deviceStore.parcelName = parcelName || "Main Parcel";
  deviceStore.region = region || "Sandbox";
  console.log(`[ORB ONLINE] URL: ${orbUrl} | Region: ${region}`);
  return res.json({ status: "success", message: "Orb registered successfully." });
});

// 2. Web Panelinin ayarları okuduğu yer
app.get('/api/settings', (req, res) => {
  res.json({
    status: "success",
    parcelName: deviceStore.parcelName || "Waiting for Orb...",
    region: deviceStore.region || "Offline",
    settings: deviceStore.settings
  });
});

// 3. Web Panelinden "Sync" veya butonlara basıldığında ayarları kaydedip SL'e basan yer
app.post('/api/settings', async (req, res) => {
  deviceStore.settings = { ...deviceStore.settings, ...req.body };

  // Eğer SL nesnesi bağlıysa, yeni ayarları nesneye fırlat
  if (deviceStore.orbUrl) {
    try {
      await axios.post(deviceStore.orbUrl, {
        command: "UPDATE_CONFIG",
        config: deviceStore.settings
      }, { timeout: 3000 });
      console.log("[SYNC] Settings pushed to Second Life Orb!");
    } catch (err) {
      console.error("[ERROR] Failed to reach in-world orb:", err.message);
    }
  }

  return res.json({ status: "success", settings: deviceStore.settings });
});

// 4. Test Discord Webhook Butonu
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "No webhook URL provided" });

  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: "🛡️ ICE Security System Connected",
        description: "Your Discord webhook is working properly! Real-time alerts will appear here.",
        color: 3447003,
        footer: { text: "ICE Security • Modern SL Guardian" },
        timestamp: new Date()
      }]
    });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: "Discord webhook failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ICE Security API running on port ${PORT}`));
