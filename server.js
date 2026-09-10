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
    enableCountdown: 1,
    countdown: 10,
    action: "eject",
    enableGroupPass: 0,
    enableHeight: 0,
    minHeight: 1.20,
    maxHeight: 2.10,
    discordWebhook: "",
    whitelist: []
  },
  visitorLogs: []
};

// 1. Orb Registration
app.post('/api/register-orb', (req, res) => {
  const { orbUrl, parcelName, region } = req.body;
  if (orbUrl) systemData.orbUrl = orbUrl;
  if (parcelName) systemData.parcelName = parcelName;
  if (region) systemData.region = region;
  systemData.lastSeen = Date.now();
  console.log(`[ORB ONLINE] ${systemData.parcelName} @ ${systemData.region}`);
  return res.json({ status: "success" });
});

// 2. Event Dispatcher (Arrivals, Departures, Breaches)
app.post('/api/record-event', async (req, res) => {
  const { eventType, avatarName, reason } = req.body;
  if (!avatarName) return res.status(400).json({ error: "Missing avatarName" });

  const now = new Date();
  const timeStr = now.toISOString().substring(11, 19) + " UTC";

  if (eventType === 'enter') {
    const exists = systemData.visitorLogs.find(v => v.name === avatarName);
    if (!exists) {
      systemData.visitorLogs.unshift({ name: avatarName, time: timeStr });
      if (systemData.visitorLogs.length > 50) systemData.visitorLogs.pop();
    }
  }

  if (systemData.settings.discordWebhook) {
    let embedTitle = "Avatar Entered";
    let embedColor = 3066993; // Green

    if (eventType === 'leave') {
      embedTitle = "Avatar Left";
      embedColor = 10070709; // Grey
    } else if (eventType === 'breach') {
      embedTitle = "Intruder Ejected";
      embedColor = 15158332; // Red
    }

    try {
      await axios.post(systemData.settings.discordWebhook, {
        embeds: [{
          title: embedTitle,
          description: `**Avatar:** \`${avatarName}\`\n**Details:** ${reason}\n**Parcel:** ${systemData.parcelName} (${systemData.region})`,
          color: embedColor,
          timestamp: new Date()
        }]
      });
    } catch (e) {
      console.error("[DISCORD ERROR]", e.message);
    }
  }

  return res.json({ status: "success" });
});

// 3. Settings Getter
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

// 4. Settings Setter & In-World Sync
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

// 5. Discord Ping Verification
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhook" });

  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: "ICE Security Operational",
        description: `Connected to **${systemData.parcelName}** (${systemData.region}). Real-time event notifications active.`,
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
app.listen(PORT, () => console.log(`ICE Security Backend running on port ${PORT}`));
