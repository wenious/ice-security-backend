const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

let systemData = {
  orbUrl: "",
  parcelName: "ICE",
  region: "Standalone",
  lastSeen: Date.now(),
  settings: {
    mode: "lockdown",
    enableCountdown: 1, // 1 = Warning açık, 0 = Uyarı kapalı (Anında)
    countdown: 10,
    action: "eject",
    enableGroupPass: 0,
    enableHeight: 0,
    minHeight: 1.20,
    maxHeight: 2.10,
    discordWebhook: "",
    whitelist: []
  },
  visitorLogs: [] // { name: "Avatar Name", time: "19:42" }
};

// 1. Orb Kayıt
app.post('/api/register-orb', (req, res) => {
  const { orbUrl, parcelName, region } = req.body;
  if (orbUrl) systemData.orbUrl = orbUrl;
  if (parcelName) systemData.parcelName = parcelName;
  if (region) systemData.region = region;
  systemData.lastSeen = Date.now();
  console.log(`[ORB ONLINE] ${systemData.parcelName} @ ${systemData.region}`);
  return res.json({ status: "success" });
});

// 2. Ziyaretçi Kaydı (LSL'den gelir)
app.post('/api/record-visit', async (req, res) => {
  const { avatarName } = req.body;
  if (!avatarName) return res.status(400).json({ error: "Missing name" });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Tekil olarak loglara ekle
  const exists = systemData.visitorLogs.find(v => v.name === avatarName);
  if (!exists) {
    systemData.visitorLogs.unshift({ name: avatarName, time: timeStr });
    if (systemData.visitorLogs.length > 50) systemData.visitorLogs.pop(); // Son 50 kişi
  }

  // Discord bildirimi açıksa webhook'a fırlat
  if (systemData.settings.discordWebhook) {
    try {
      await axios.post(systemData.settings.discordWebhook, {
        embeds: [{
          title: "👤 New Visitor Detected",
          description: `**Avatar:** \`${avatarName}\`\n**Parcel:** ${systemData.parcelName}\n**Region:** ${systemData.region}`,
          color: 3066993,
          timestamp: new Date()
        }]
      });
    } catch (e) {
      console.error("[DISCORD ERROR] Failed to forward visitor log:", e.message);
    }
  }

  return res.json({ status: "success", count: systemData.visitorLogs.length });
});

// 3. İhlal Bildirimi (LSL Eject basınca gelir)
app.post('/api/record-breach', async (req, res) => {
  const { avatarName, reason } = req.body;
  if (systemData.settings.discordWebhook) {
    try {
      await axios.post(systemData.settings.discordWebhook, {
        embeds: [{
          title: "🚨 Intruder Ejected",
          description: `**Avatar:** \`${avatarName}\`\n**Reason:** ${reason}\n**Parcel:** ${systemData.parcelName}\n**Action:** ${systemData.settings.action.toUpperCase()}`,
          color: 15158332,
          timestamp: new Date()
        }]
      });
    } catch (e) {
      console.error("[DISCORD BREACH] Webhook failed:", e.message);
    }
  }
  return res.json({ status: "success" });
});

// 4. Ayarları Getir
app.get('/api/settings', (req, res) => {
  res.json({
    status: "success",
    parcelName: systemData.parcelName,
    region: systemData.region,
    totalVisits: systemData.visitorLogs.length,
    visitorLogs: systemData.visitorLogs,
    settings: systemData.settings
  });
});

// 5. Ayarları Kaydet ve Orb'a İlet
app.post('/api/settings', async (req, res) => {
  systemData.settings = { ...systemData.settings, ...req.body };

  if (systemData.orbUrl) {
    try {
      await axios.post(systemData.orbUrl, {
        command: "CONFIG_UPDATE",
        config: systemData.settings
      }, { timeout: 4000 });
      console.log("[SYNC] Settings delivered to in-world Orb.");
    } catch (err) {
      console.error("[SYNC FAIL] Could not reach orb:", err.message);
    }
  }

  return res.json({ status: "success", settings: systemData.settings });
});

// 6. Test Discord
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhook" });

  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: "🛡️ ICE Security • System Operational",
        description: `Connected to **${systemData.parcelName}** (${systemData.region}). Real-time intruder and visitor alerts are now active.`,
        color: 3447003,
        timestamp: new Date()
      }]
    });
    return res.json({ status: "success" });
  } catch (err) {
    return res.status(500).json({ error: "Discord ping error" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ICE Security Backend alive on port ${PORT}`));
