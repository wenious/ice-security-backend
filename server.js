const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

let deviceStore = {
  orbUrl: "",
  parcelName: "",
  region: "",
  settings: {
    mode: "lockdown",
    countdown: 10,
    action: "eject",
    enableGroupPass: 0,
    enableHeight: 0,
    minHeight: 1.20,
    maxHeight: 2.10,
    discordWebhook: "",
    whitelist: []
  },
  visitors: [] // Günlük tekil avatarlar (UUID veya isim)
};

// 1. Orb Kaydı
app.post('/api/register-orb', (req, res) => {
  const { orbUrl, parcelName, region } = req.body;
  deviceStore.orbUrl = orbUrl;
  deviceStore.parcelName = parcelName || "Main Parcel";
  deviceStore.region = region || "Sandbox";
  return res.json({ status: "success" });
});

// 2. Ziyaretçi Kaydı (LSL'den tetiklenir)
app.post('/api/record-visit', (req, res) => {
  const { avatarName } = req.body;
  if (avatarName && !deviceStore.visitors.includes(avatarName)) {
    deviceStore.visitors.push(avatarName);
    console.log(`[VISITOR LOGGED] ${avatarName} | Total: ${deviceStore.visitors.length}`);
  }
  return res.json({ status: "success", totalVisits: deviceStore.visitors.length });
});

// 3. Ayarları ve Ziyaretçi Sayısını Çekme
app.get('/api/settings', (req, res) => {
  res.json({
    status: "success",
    parcelName: deviceStore.parcelName || "Waiting for Orb...",
    region: deviceStore.region || "Offline",
    totalVisits: deviceStore.visitors.length,
    settings: deviceStore.settings
  });
});

// 4. Ayarları Kaydetme ve Orb'a Basma
app.post('/api/settings', async (req, res) => {
  deviceStore.settings = { ...deviceStore.settings, ...req.body };

  if (deviceStore.orbUrl) {
    try {
      await axios.post(deviceStore.orbUrl, {
        command: "UPDATE_CONFIG",
        config: deviceStore.settings
      }, { timeout: 3000 });
    } catch (err) {
      console.error("[ERROR] Could not sync to in-world orb:", err.message);
    }
  }

  return res.json({ status: "success", settings: deviceStore.settings });
});

// 5. Discord Test
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhook" });

  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: "🛡️ ICE Security System Connected",
        description: "Your Discord alerts are now operational.",
        color: 3447003,
        timestamp: new Date()
      }]
    });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: "Discord ping failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ICE API on port ${PORT}`));
