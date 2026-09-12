const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());

const DB_FILE = path.join(__dirname, 'devices_db.json');

// Helper: Read persistent devices from disk to survive Render restarts
function loadDevices() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[DATABASE] Failed to read disk DB:', err.message);
  }
  return {};
}

// Helper: Save devices to disk
function saveDevices(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[DATABASE] Failed to write disk DB:', err.message);
  }
}

let devices = loadDevices();

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
      onlineAvatars: []
    };
    saveDevices(devices);
  }
  return devices[ownerId];
}

// 1. Orb Registration (In-World -> Backend)
app.post('/api/register-orb', (req, res) => {
  const { ownerId, orbUrl, parcelName, region } = req.body;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  if (orbUrl) device.orbUrl = orbUrl;
  if (parcelName) device.parcelName = parcelName;
  if (region) device.region = region;
  device.lastSeen = Date.now();

  saveDevices(devices);

  console.log(`[ORB REGISTERED] Owner: ${ownerId} | URL: ${orbUrl} | Parcel: ${device.parcelName} @ ${device.region}`);
  return res.json({ status: "success", message: "Orb registered successfully" });
});

// 2. Live Presence Sync (In-World -> Backend)
app.post('/api/update-live-presence', (req, res) => {
  const { ownerId, onlineAvatars } = req.body;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  device.onlineAvatars = onlineAvatars || [];
  return res.json({ status: "success" });
});

// 3. Event Dispatcher & Discord Notifications
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
      saveDevices(devices);
    }
  }

  if (device.settings.discordWebhook) {
    let embedTitle = "Avatar Entered";
    let embedColor = 3066993; // Green

    if (eventType === 'leave') {
      embedTitle = "Avatar Left";
      embedColor = 10070709; // Gray
    } else if (eventType === 'breach') {
      embedTitle = "Intruder Ejected";
      embedColor = 15158332; // Red
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

// 4. Remote Manual Kick (Panel -> In-World)
app.post('/api/manual-action', async (req, res) => {
  const { ownerId, targetName } = req.body;
  if (!ownerId || !targetName) return res.status(400).json({ error: "Missing parameters" });

  const device = getDevice(ownerId);
  if (!device.orbUrl) {
    console.error(`[MANUAL EJECT] Failed: No orb URL registered for owner ${ownerId}`);
    return res.status(404).json({ error: "Orb offline or unlinked" });
  }

  try {
    const payload = {
      action: "MANUAL_EJECT",
      targetName: targetName
    };

    await axios.post(device.orbUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000
    });

    console.log(`[MANUAL EJECT] Dispatched eject for ${targetName} to orb (${ownerId})`);
    return res.json({ status: "success" });
  } catch (err) {
    console.error(`[MANUAL EJECT FAIL] Target: ${targetName} | Error: ${err.message}`);
    return res.status(500).json({ error: "Failed to dispatch command to in-world orb", details: err.message });
  }
});

// 5. Settings & State Getter (Panel Read)
app.get('/api/settings', (req, res) => {
  const ownerId = req.query.id;
  if (!ownerId) {
    return res.json({
      status: "waiting",
      parcelName: "Click Orb In-World",
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
    orbConnected: Boolean(device.orbUrl),
    totalVisits: device.visitorLogs.length,
    visitorLogs: device.visitorLogs,
    onlineAvatars: device.onlineAvatars || [],
    settings: device.settings
  });
});

// 6. Settings Setter & In-World Sync (Panel -> Backend -> In-World)
app.post('/api/settings', async (req, res) => {
  const ownerId = req.query.id || req.body.ownerId;
  if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

  const device = getDevice(ownerId);
  device.settings = { ...device.settings, ...req.body };
  saveDevices(devices);

  if (!device.orbUrl) {
    console.warn(`[SYNC WARN] Cannot dispatch settings: No active orbUrl for owner ${ownerId}.`);
    return res.status(404).json({
      status: "warning",
      error: "In-world orb not connected. Touch the orb in Second Life to re-register.",
      settings: device.settings
    });
  }

  try {
    const rawWhitelist = device.settings.whitelist;
    const whitelistCsv = Array.isArray(rawWhitelist) ? rawWhitelist.join(",") : (rawWhitelist || "");

    // Matched flat JSON format expected by LSL Core parser
    const payload = {
      action: "SYNC_SETTINGS",
      command: "CONFIG_UPDATE",
      whitelist: whitelistCsv,
      active: device.settings.mode === "lockdown" ? "true" : "false",
      countdown: String(device.settings.countdown || 10),
      actionType: device.settings.action || "eject"
    };

    console.log(`[DISPATCHING TO SL] Target: ${device.orbUrl} | Payload:`, JSON.stringify(payload));

    const response = await axios.post(device.orbUrl, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 5000
    });

    console.log(`[SYNC SUCCESS] Delivered to orb (${ownerId}). Response:`, response.data);
    return res.json({ status: "success", settings: device.settings });
  } catch (err) {
    console.error(`[SYNC FAIL] Could not reach orb at ${device.orbUrl}: ${err.message}`);
    return res.status(502).json({
      error: "Failed to communicate with in-world orb",
      details: err.message,
      settings: device.settings
    });
  }
});

// 7. Discord Webhook Test
app.post('/api/test-discord', async (req, res) => {
  const { webhookUrl, ownerId } = req.body;
  if (!webhookUrl) return res.status(400).json({ error: "Missing webhook URL" });

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
    return res.status(500).json({ error: "Discord ping failed", details: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`[ICE Security] Multi-Tenant Engine running on port ${PORT}`));
