const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());
app.use(express.json());

let devices = {};

function getDevice(ownerId) {
  if (!ownerId) return null;
  if (!devices[ownerId]) {
    devices[ownerId] = {
      orbUrl: "",
      parcelName: "Main Parcel",
      region: "Sandbox",
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
      visitorLogs: [],
      onlineAvatars: [] // Live presence
    };
  }
  return devices[ownerId];
}

// 1. Orb Registration
app.post('/api/register-orb', (req, res) => {
  const { ownerId, orbUrl, parcelName, region } = req.body;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  if (orbUrl) device.orbUrl = orbUrl;
  if (parcelName) device.parcelName = parcelName;
  if (region) device.region = region;
  device.lastSeen = Date.now();

  console.log(`[ORB REGISTERED] Owner: ${ownerId} | Parcel: ${device.parcelName} @ ${device.region}`);
  return res.json({ status: "success" });
});

// 2. Live Presence Sync (Online Avatars)
app.post('/api/update-live-presence', (req, res) => {
  const { ownerId, onlineAvatars } = req.body;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  device.onlineAvatars = onlineAvatars || [];
  return res.json({ status: "success" });
});

// 3. Event Dispatcher
app.post('/api/record-event', async (req, res) => {
  const { ownerId, eventType, avatarName, reason } = req.body;
  if (!ownerId || !avatarName) return res.status(400).json({ error: "Missing parameters" });

  const device = getDevice(ownerId);
  const now = new Date();
  const timeStr = now.toISOString().substring(11, 19) + " UTC";

  if (eventType === 'enter') {
    const exists = device.visitorLogs.find(v => v.name === avatarName);
    if (!exists) {
      device.visitorLogs.unshift({ name: avatarName, time: timeStr });
      if (device.visitorLogs.length > 50) device.visitorLogs.pop();
    }
  }

  if (device.settings.discordWebhook) {
    let embedTitle = "Avatar Entered";
    let embedColor = 3066993;

    if (eventType === 'leave') {
      embedTitle = "Avatar Left";
      embedColor = 10070709;
    } else if (eventType === 'breach') {
      embedTitle = "Intruder Ejected";
      embedColor = 15158332;
    }

    try {
      await axios.post(device.settings.discordWebhook, {
        embeds: [{
          title: embedTitle,
          description: `**Avatar:** \`${avatarName}\`\n**Details:** ${reason}\n**Parcel:** ${device.parcelName} (${device.region})`,
          color: embedColor,
          timestamp: new Date()
        }]
      });
    } catch (e) {
      console.error(`[DISCORD FAIL] Owner ${ownerId}: ${e.message}`);
    }
  }

  return res.json({ status: "success" });
});

// 4. Settings & Live Data Getter
app.get('/api/settings', (req, res) => {
  const ownerId = req.query.id;
  if (!ownerId) {
    return res.json({
      status: "waiting",
      parcelName: "Scan QR or Click Orb",
      region: "No Device Linked",
      totalVisits: 0,
      visitorLogs: [],
      onlineAvatars: [],
      settings: {}
    });
  }

  const device = getDevice(ownerId);
  return res.json({
    status: "success",
    parcelName: device.parcelName,
    region: device.region,
    totalVisits: device.visitorLogs.length,
    visitorLogs: device.visitorLogs,
    onlineAvatars: device.onlineAvatars || [],
    settings: device.settings
  });
});

// 5. Settings Setter & In-World Sync
app.post('/api/settings', async (req, res) => {
  const ownerId = req.query.id || req.body.ownerId;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  device.settings = { ...device.settings, ...req.body };

  if (device.orbUrl) {
    try {
      await axios.post(device.orbUrl, {
        command: "CONFIG_UPDATE",
        config: device.settings
      }, { timeout: 4000 });
      console.log(`[SYNC SUCCESS] Pushed settings to orb for owner: ${ownerId}`);
    } catch (err) {
      console.error(`[SYNC FAIL] Could not reach orb for ${ownerId}: ${err.message}`);
    }
  }

  return res.json({ status: "success", settings: device.settings });
});

// 6. Discord Ping Verification
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl, ownerId } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhook" });

  const device = getDevice(ownerId);
  try {
    await axios.post(webhookUrl, {
      embeds: [{
        title: "ICE Security Operational",
        description: `Connected to **${device.parcelName}** (${device.region}). Real-time event notifications active.`,
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
app.listen(PORT, () => console.log(`ICE Security Multi-Tenant Engine running on port ${PORT}`));
