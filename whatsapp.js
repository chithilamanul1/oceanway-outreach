// ═══════════════════════════════════════════════════════════════════════════════
// WhatsApp Module: Admin Notification & Rate Sheet Delivery
// Forwards downloaded rate sheet documents directly to the travel agent's WhatsApp
// ═══════════════════════════════════════════════════════════════════════════════

import pkg from "whatsapp-web.js";
const { Client, LocalAuth, MessageMedia } = pkg;
import qrcode from "qrcode-terminal";
import { existsSync, writeFileSync } from "node:fs";

let waClient = null;
let isReady = false;
let initPromise = null;
let currentQr = null;

export function getWhatsAppStatus() {
  return { isReady, hasClient: Boolean(waClient), hasQr: Boolean(currentQr), qr: currentQr };
}

/**
 * Clean phone number to international format (e.g. 0760602638 -> 94760602638)
 */
export function cleanPhoneNumber(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "94" + cleaned.substring(1);
  }
  return cleaned;
}

export async function requestWhatsAppPairingCode(phone) {
  if (!waClient) {
    await initWhatsApp();
  }
  const target = phone || process.env.BOT_WHATSAPP_NUMBER || "94760602638";
  const cleanPhone = cleanPhoneNumber(target);
  if (!cleanPhone) throw new Error("No valid phone number provided for pairing");
  if (waClient && typeof waClient.requestPairingCode === "function") {
    const code = await waClient.requestPairingCode(cleanPhone);
    console.log(`\n🔑 WHATSAPP PAIRING CODE FOR SENDER (${cleanPhone}): ${code}\n`);
    return code;
  }
  throw new Error("WhatsApp client is not ready or pairing code is not supported");
}

/**
 * Format a Sri Lankan phone number for WhatsApp chat ID
 */
export function formatPhoneForWhatsApp(phone) {
  const cleaned = cleanPhoneNumber(phone);
  return cleaned ? cleaned + "@c.us" : null;
}

/**
 * Initialize WhatsApp client (Single account for admin delivery)
 */
export async function initWhatsApp() {
  if (isReady && waClient) return waClient;
  if (initPromise) return initPromise;

  initPromise = new Promise((resolve) => {
    console.log("\n📱 Initializing WhatsApp Client for Rate Sheet Delivery...");

    const isWindows = process.platform === "win32";
    const puppeteerOptions = {
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu"
      ]
    };

    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      puppeteerOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else if (isWindows && existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
      puppeteerOptions.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    }
    // Run headless for background daemon stability
    puppeteerOptions.headless = true;

    waClient = new Client({
      authStrategy: new LocalAuth({ clientId: "travel-admin", dataPath: "./.wwebjs_auth" }),
      puppeteer: puppeteerOptions,
      webVersionCache: {
        type: "none",
      },
    });

    waClient.on("qr", async (qr) => {
      currentQr = qr;
      console.log("\n📲 Scan this QR code with WhatsApp to connect your delivery number:\n");
      qrcode.generate(qr, { small: true });
      console.log("   Open WhatsApp on your phone -> Linked Devices -> Link a Device.\n");

      try {
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(qr)}`;
        const res = await fetch(qrUrl);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          writeFileSync("public/whatsapp_qr.png", buffer);
          writeFileSync("public/whatsapp_qr.html", `<!DOCTYPE html>
<html>
<head>
  <title>Connect WhatsApp - Oceanway Tours</title>
  <meta charset="utf-8">
  <meta http-equiv="refresh" content="15">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #0b141a; color: #e9edef; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
    .card { background: #111b21; padding: 36px 44px; border-radius: 16px; text-align: center; box-shadow: 0 10px 25px rgba(0,0,0,0.5); border: 1px solid #222d34; max-width: 420px; }
    h2 { color: #00a884; margin-top: 0; font-size: 22px; }
    p { color: #8696a0; font-size: 14px; line-height: 1.5; }
    .qr-box { background: white; padding: 14px; border-radius: 12px; display: inline-block; margin: 18px 0; }
    img { width: 280px; height: 280px; display: block; }
    .steps { text-align: left; background: #202c33; padding: 16px 20px; border-radius: 10px; margin-top: 14px; font-size: 13px; color: #d1d7db; }
    .steps ol { margin: 0; padding-left: 20px; }
    .steps li { margin-bottom: 6px; }
    .steps li:last-child { margin-bottom: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h2>📱 Connect Oceanway WhatsApp</h2>
    <div style="background: #1f2c34; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; text-align: left;">
      <div>📤 <b>Sender Account:</b> <span style="color:#25d366;">0760602638</span> (+94 76 060 2638)</div>
      <div style="margin-top: 4px;">📥 <b>Delivery Destination:</b> <span style="color:#00a884;">+94 71 177 0186</span></div>
    </div>
    <p>Scan with WhatsApp on phone <b>0760602638</b> to automatically forward incoming hotel rate sheets to <b>+94 71 177 0186</b>.</p>
    <div class="qr-box">
      <img src="whatsapp_qr.png?t=${Date.now()}" alt="WhatsApp QR Code" />
    </div>
    <div id="pairingBox" style="margin: 12px 0;">
      <button onclick="getPairingCode()" style="background:#00a884;color:#fff;border:none;padding:10px 18px;border-radius:8px;font-weight:bold;cursor:pointer;">Get 8-Digit Pairing Code Instead</button>
      <div id="codeDisplay" style="margin-top:10px;font-size:24px;font-weight:bold;letter-spacing:4px;color:#25d366;"></div>
    </div>
    <div class="steps">
      <ol>
        <li>Open WhatsApp on phone <b>0760602638</b></li>
        <li>Tap <b>Menu (⋮)</b> or <b>Settings</b> &gt; <b>Linked Devices</b></li>
        <li>Tap <b>Link a Device</b> and point camera at QR (or choose <i>Link with phone number</i>)</li>
      </ol>
    </div>
    <p style="font-size: 12px; color: #667781; margin-top: 16px;">This page refreshes automatically until connected.</p>
  </div>
  <script>
    async function getPairingCode() {
      const btn = document.querySelector('#pairingBox button');
      btn.innerText = 'Requesting code...';
      try {
        const res = await fetch('/api/whatsapp/pairing-code', { credentials: 'omit', method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ phone: '94760602638' }) });
        const d = await res.json();
        if (d.pairingCode) {
          document.getElementById('codeDisplay').innerText = d.pairingCode;
          btn.innerText = 'New Code Generated';
        } else {
          alert('Error: ' + (d.error || 'Failed'));
          btn.innerText = 'Retry Pairing Code';
        }
      } catch (e) {
        alert(e.message);
        btn.innerText = 'Retry';
      }
    }
  </script>
</body>
</html>`);
          console.log("   📸 QR Code saved to public/whatsapp_qr.png and http://localhost:3000/whatsapp_qr.html");
        }
      } catch (_) {}
    });

    waClient.on("ready", async () => {
      console.log("✅ WhatsApp Client connected and ready to send rate sheets!\n");
      isReady = true;
      try {
        if (waClient.pupPage) {
          await waClient.pupPage.evaluate(() => {
            if (window.WWebJS) {
              window.WWebJS.mediaDataFields = (mediaData) => {
                const internals = [
                  'revisionNumber',
                  'parent',
                  'collection',
                  '_uiObservers',
                  'mirror',
                ];
                return Object.fromEntries(
                  Object.entries(mediaData).filter(
                    ([key]) => !key.startsWith('__') && !internals.includes(key),
                  ),
                );
              };
            }
          });
        }
      } catch (_) {}
      resolve(waClient);
    });

    waClient.on("authenticated", () => {
      console.log("🔐 WhatsApp authenticated successfully.");
    });

    waClient.on("auth_failure", (msg) => {
      console.error("✖ WhatsApp auth failed:", msg);
      resolve(null);
    });

    waClient.on("disconnected", (reason) => {
      console.warn("⚠ WhatsApp disconnected:", reason);
      isReady = false;
    });

    waClient.initialize().catch((err) => {
      console.error("✖ WhatsApp init error:", err.message);
      resolve(null);
    });
  });

  return initPromise;
}

/**
 * Forward a downloaded rate sheet attachment directly to user's WhatsApp
 */
export async function forwardRateSheetToWhatsApp(filePath, hotelName, starCategory = "Hotel") {
  const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
  if (!adminPhone) {
    console.warn("  ⚠ ADMIN_WHATSAPP_NUMBER not set in .env — skipping WhatsApp forward.");
    return false;
  }

  if (!existsSync(filePath)) {
    console.warn(`  ⚠ Cannot send to WhatsApp: file does not exist at ${filePath}`);
    return false;
  }

  const chatId = formatPhoneForWhatsApp(adminPhone);
  if (!chatId) {
    console.warn("  ⚠ Invalid ADMIN_WHATSAPP_NUMBER in .env");
    return false;
  }

  try {
    // Ensure client is ready
    if (!isReady || !waClient) {
      await initWhatsApp();
    }

    if (!waClient || !isReady) {
      console.warn("  ⚠ WhatsApp client is not connected — cannot forward rate sheet.");
      return false;
    }

    const fileName = filePath.split(/[\\/]/).pop();
    const media = MessageMedia.fromFilePath(filePath);

    const caption = `🏨 *NEW RATE SHEET RECEIVED!*\n\n*Hotel:* ${hotelName}\n*Category:* ${starCategory}\n*File:* ${fileName}\n\n📁 *Saved locally in:* \`${filePath}\`\nReady for travel package costing! 📊`;

    console.log(`  📲 Forwarding "${fileName}" to WhatsApp (${adminPhone})...`);
    try {
      await waClient.sendMessage(chatId, media, { caption, sendMediaAsDocument: true });
      console.log(`  ✅ Successfully sent rate sheet directly to WhatsApp!`);
      return true;
    } catch (mediaErr) {
      console.warn(`  ⚠ Media attachment send failed (${mediaErr.message}). Sending text notification fallback...`);
      await waClient.sendMessage(chatId, caption).catch(() => {});
      return false;
    }
  } catch (err) {
    console.warn(`  ⚠ Failed to forward rate sheet to WhatsApp: ${err.message}`);
    return false;
  }
}

/**
 * Send a plain WhatsApp text message
 */
export async function sendWhatsAppMessage(phone, message) {
  if (!isReady || !waClient) return false;
  const chatId = formatPhoneForWhatsApp(phone);
  if (!chatId) return false;

  try {
    await waClient.sendMessage(chatId, message);
    return true;
  } catch (err) {
    console.warn(`  ⚠ WhatsApp send error: ${err.message}`);
    return false;
  }
}
