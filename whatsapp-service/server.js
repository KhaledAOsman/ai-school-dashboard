/**
 * Standalone WhatsApp bridge service.
 *
 * Uses whatsapp-web.js (an UNOFFICIAL library that automates the WhatsApp
 * Web browser client via Puppeteer, not Meta's official Business API).
 * This is a deliberate choice made by the user, who was warned that:
 *   - It violates WhatsApp's Terms of Service for business/automated use.
 *   - The connected number can be banned without notice, especially as
 *     message volume grows.
 *   - The linked session must stay "online" (this service running,
 *     connected to the internet) at all times - it's not a one-time link.
 *
 * This service exposes a small internal HTTP API for the Python backend
 * to call:
 *   GET  /status          -> connection status + phone number if linked
 *   GET  /qr               -> current QR code (as a data URL) if awaiting scan
 *   POST /send             -> { phone, message } send a plain text message
 *   POST /logout            -> unlink the current session
 *
 * This API is INTERNAL ONLY - it must never be exposed to the public
 * internet directly (no auth of its own). In docker-compose it sits on
 * the same internal network as the backend, with no published port.
 */
const express = require("express");
const bodyParser = require("body-parser");
const qrcode = require("qrcode");
const { Client, LocalAuth } = require("whatsapp-web.js");

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 3001;

// In-memory state - simple and sufficient for a single-number bridge.
// The actual WhatsApp session itself persists to disk via LocalAuth
// (mounted as a Docker volume), so a service restart does NOT require
// re-scanning the QR code as long as the session data survives.
let state = {
  status: "initializing", // initializing | qr_pending | connected | disconnected
  qrDataUrl: null,
  phoneNumber: null,
  lastError: null,
};

const client = new Client({
  authStrategy: new LocalAuth({ dataPath: "/app/wwebjs_auth" }),
  puppeteer: {
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  },
});

client.on("qr", async (qr) => {
  state.status = "qr_pending";
  state.qrDataUrl = await qrcode.toDataURL(qr);
  console.log("QR code generated - awaiting scan.");
});

client.on("ready", () => {
  state.status = "connected";
  state.qrDataUrl = null;
  state.phoneNumber = client.info?.wid?.user ?? null;
  state.lastError = null;
  console.log(`WhatsApp connected as ${state.phoneNumber}`);
});

client.on("disconnected", (reason) => {
  state.status = "disconnected";
  state.phoneNumber = null;
  state.lastError = String(reason);
  console.log("WhatsApp disconnected:", reason);
  // Attempt to re-initialize so a transient network blip doesn't require
  // manual intervention - a real ban or logout will just show qr_pending
  // again on the next successful init.
  client.initialize().catch((err) => {
    state.lastError = String(err);
  });
});

client.on("auth_failure", (msg) => {
  state.status = "disconnected";
  state.lastError = String(msg);
  console.error("WhatsApp auth failure:", msg);
});

client.initialize().catch((err) => {
  state.status = "disconnected";
  state.lastError = String(err);
  console.error("Failed to initialize WhatsApp client:", err);
});

app.get("/status", (req, res) => {
  res.json({
    status: state.status,
    phone_number: state.phoneNumber,
    last_error: state.lastError,
  });
});

app.get("/qr", (req, res) => {
  if (state.status !== "qr_pending" || !state.qrDataUrl) {
    return res.status(404).json({ error: "No QR code currently available" });
  }
  res.json({ qr_data_url: state.qrDataUrl });
});

app.post("/send", async (req, res) => {
  const { phone, message } = req.body || {};
  if (!phone || !message) {
    return res.status(400).json({ error: "phone and message are required" });
  }
  if (state.status !== "connected") {
    return res.status(409).json({ error: "WhatsApp is not connected" });
  }
  const digitsOnly = String(phone).replace(/\D/g, "");

  // WhatsApp's "LID" (linked identity) rollout broke whatsapp-web.js's
  // internal contact/number resolution for a lot of numbers - both
  // getNumberId() AND a hand-built "<digits>@c.us" chat id can now throw
  // or fail with "No LID for user" depending on the number, and which
  // approach works is inconsistent (this is an open upstream bug in the
  // library itself, not something fixable from our side - see
  // https://github.com/wwebjs/whatsapp-web.js/issues/3834). So: try the
  // proper resolution first (it also validates the number actually
  // exists on WhatsApp), and fall back to the plain @c.us id if that
  // throws, instead of hard-failing on either one alone.
  let chatId = `${digitsOnly}@c.us`;
  try {
    const numberId = await client.getNumberId(digitsOnly);
    if (numberId) {
      chatId = numberId._serialized;
    } else {
      console.warn(`getNumberId found no WhatsApp account for ${digitsOnly} - trying raw chat id anyway`);
    }
  } catch (err) {
    console.warn(`getNumberId failed for ${digitsOnly} (${err}) - falling back to raw chat id`);
  }

  try {
    await client.sendMessage(chatId, message);
    res.json({ ok: true });
  } catch (err) {
    console.error("Send failed:", err);
    res.status(500).json({ error: String(err) });
  }
});

app.post("/logout", async (req, res) => {
  try {
    await client.logout();
    state.status = "disconnected";
    state.phoneNumber = null;
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`WhatsApp bridge service listening on port ${PORT}`);
});
