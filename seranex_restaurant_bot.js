#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Solutions - Conversational WhatsApp Sales Agent & State Manager
// ─────────────────────────────────────────────────────────────────────────────
// Manages the complete lifecycle of restaurant leads:
// State 0: Lead Found
// State 1: Outreach Sent
// State 2: In Conversation (Dynamic bilingual Sinhala/English objection handling)
// State 3: Deal Won / Hot Lead -> Immediate Alert to Admin WhatsApp & Discord
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const RESTAURANTS_DB_PATH = "restaurant_leads_db.json";
const CONVERSATIONS_PATH = "restaurant_conversations.json";

const ADMIN_WHATSAPP = process.env.ADMIN_WHATSAPP_NUMBER || "94711770186";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";

const SEND_DELAY_MS = 25_000; // 25s between outreach messages to keep WhatsApp safe

// ─── DATABASE HELPERS ───────────────────────────────────────────────────────
function loadLeadsDb() {
  if (!existsSync(RESTAURANTS_DB_PATH)) return [];
  try {
    return JSON.parse(readFileSync(RESTAURANTS_DB_PATH, "utf-8"));
  } catch {
    return [];
  }
}

function saveLeadsDb(data) {
  writeFileSync(RESTAURANTS_DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function loadConversations() {
  if (!existsSync(CONVERSATIONS_PATH)) return {};
  try {
    return JSON.parse(readFileSync(CONVERSATIONS_PATH, "utf-8"));
  } catch {
    return {};
  }
}

function saveConversations(data) {
  writeFileSync(CONVERSATIONS_PATH, JSON.stringify(data, null, 2), "utf-8");
}

function formatPhoneForWhatsApp(phone) {
  if (!phone) return null;
  let cleaned = phone.replace(/[^0-9]/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "94" + cleaned.substring(1);
  }
  return cleaned.includes("@c.us") ? cleaned : `${cleaned}@c.us`;
}

// ─── CONVERSATIONAL AI SYSTEM PROMPT ───────────────────────────────────────
const BOT_SYSTEM_PROMPT = `You are "Kasun", a senior digital consultant at "Seranex Solutions" (https://seranex.lk) based in Sri Lanka.
You are chatting with a local restaurant or cafe owner on WhatsApp who received our initial outreach message about our New Year Website + Cinematic Video Ad bundle.

Your Goal:
Build trust, answer their questions, handle objections with real business logic, and close them on a meeting, demo, or invoice.

Key Agency Details:
- Agency: Seranex Solutions (seranex.lk)
- Special Offer: Custom Restaurant Website + 4K Cinematic Video Ad (for TikTok/Reels) bundled together.
- Delivery Speed: 1 to 2 days turn-around time.
- Website Features: Mobile-responsive digital menu, Google Maps SEO integration, Direct WhatsApp Ordering button (no UberEats/PickMe 25-30% commissions!), Table Reservation form, Photo Gallery.
- Domain & Hosting: 1 year included for free.
- Pricing: Starting from Rs. 28,000 - 35,000 (or $100 equivalent) for the complete all-in-one bundle.
- Payment terms: 50% advance to start, 50% upon delivery & review.
- Social Proof: Mention our verified work with local tourism & hospitality brands like Oceanway Tours and local cafes, portfolio at https://seranex.lk.

Language & Style:
- Effortlessly bilingual: Use natural conversational Sinhala (e.g. "ඔව් සහෝදරයා / අනිවාර්යයෙන්ම", "Facebook එක හොඳයි, හැබැයි Google search කරද්දී...") blended seamlessly with clear professional English.
- WhatsApp format: Keep answers punchy and conversational (2-4 sentences max per reply).
- Do NOT sound robotic, stiff, or like Google Translate. Be warm, respectful, and sharp.

How to Handle Objections:
1. "We already have a Facebook / Instagram page":
   Reply: "Facebook/Instagram එක social media වලට හොඳයි සහෝදරයා, හැබැයි local & foreign customers ලා Google එකේ 'best food near me' හෝ 'restaurants near Seeduwa' කියලා search කරද්දී Facebook links උඩට එන්නේ නැහැ. Website එකක් තියෙද්දී Google Maps & Search වල rank වෙලා direct orders එනවා—PickMe/UberEats 25% commission එකත් ඉතිරි වෙනවා."
2. "How much is it? / Pricing":
   Quote our special New Year all-in-one package (Website + Video Ad + 1 Year Domain/Hosting) around Rs. 28,000 - 35,000 all-inclusive, and mention 1-2 days fast delivery.
3. "Can I see some sample work?":
   Share our portfolio link: https://seranex.lk and offer to send a quick mock layout for their restaurant.
4. "I'm interested / Let's do it / Call me / Send bank details":
   Acknowledge enthusiastically, confirm their contact number and preferred call time, and state that our director will call them directly within 15 minutes!

CRITICAL INSTRUCTION - CLASSIFICATION TAG:
At the very end of your reply, on a new line, you MUST append EXACTLY ONE status tag:
[STATE:IN_CONVERSATION] -> If they are asking questions, curious, or negotiating.
[STATE:HOT_DEAL] -> If they agreed, asked to proceed, asked for meeting/call, or requested payment details/invoice.
[STATE:COLD] -> If they said strictly not interested or stop messaging.`;

async function getAIReply(history, leadName) {
  const messages = [
    { role: "system", content: BOT_SYSTEM_PROMPT },
    {
      role: "user",
      content: `Context: You are chatting with the owner/manager of "${leadName || "a local restaurant"}". Here is the conversation history:`,
    },
    ...history.slice(-10),
  ];

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://seranex.lk",
        "X-Title": "Seranex Sales Agent",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        max_tokens: 300,
        temperature: 0.6,
      }),
    });

    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (err) {
    console.warn(`  ⚠ OpenRouter error: ${err.message}`);
    return null;
  }
}

function parseAIResponse(text) {
  if (!text) return { replyText: null, state: null };

  let state = "STATE_2_IN_CONVERSATION";
  if (text.includes("[STATE:HOT_DEAL]")) state = "STATE_3_HOT_DEAL";
  else if (text.includes("[STATE:COLD]")) state = "STATE_COLD";
  else if (text.includes("[STATE:IN_CONVERSATION]")) state = "STATE_2_IN_CONVERSATION";

  const cleanReply = text
    .replace(/\[STATE:(IN_CONVERSATION|HOT_DEAL|COLD)\]/g, "")
    .trim();

  return { replyText: cleanReply, state };
}

// ─── ADMIN NOTIFICATIONS (WHATSAPP & DISCORD) ──────────────────────────────
async function alertAdminHotLead(client, lead, lastMessage) {
  const alertText = `🔥 *HOT LEAD CLOSED!* 🚀
━━━━━━━━━━━━━━━━━━━━
🍽️ *Restaurant:* ${lead.name}
📍 *Region:* ${lead.region}
📞 *Owner Phone:* ${lead.phone}
💬 *Latest Reply:* "${lastMessage}"
━━━━━━━━━━━━━━━━━━━━
✅ *Status:* Agreed to Video Ad + Website package!
👉 *Ready for your direct call or invoice.*`;

  // 1. Send direct WhatsApp ping to admin
  try {
    const adminChatId = formatPhoneForWhatsApp(ADMIN_WHATSAPP);
    if (adminChatId) {
      await client.sendMessage(adminChatId, alertText);
      console.log(`\n📲 Admin WhatsApp notified directly for hot lead: ${lead.name}`);
    }
  } catch (err) {
    console.warn(`  ⚠ Could not send admin WhatsApp ping: ${err.message}`);
  }

  // 2. Send Discord Embed
  if (DISCORD_WEBHOOK_URL) {
    const embed = {
      title: `🔥 HOT LEAD CLOSED: ${lead.name}!`,
      color: 0x00ff88,
      description: `**Ready for direct call or invoice!**\nOwner agreed / interested in the Website + Video Ad package.`,
      fields: [
        { name: "Restaurant", value: lead.name, inline: true },
        { name: "Phone", value: `\`${lead.phone}\``, inline: true },
        { name: "Region", value: lead.region, inline: true },
        { name: "Latest Response", value: `>>> ${lastMessage.slice(0, 500)}`, inline: false },
        { name: "Action", value: "📞 Call owner or send bank details now", inline: false },
      ],
      footer: { text: "Seranex Solutions • Sales Handoff" },
      timestamp: new Date().toISOString(),
    };

    try {
      await fetch(DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ embeds: [embed] }),
      });
    } catch (_) {}
  }
}

// ─── MAIN BOT CLIENT ────────────────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("  🤖 SERANEX SOLUTIONS - WHATSAPP SALES BOT & STATE CONTROLLER");
  console.log("═".repeat(70));

  const isWindows = process.platform === "win32";
  const puppeteerOptions = {
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-accelerated-2d-canvas",
      "--no-first-run",
      "--disable-gpu",
    ],
  };

  if (isWindows && existsSync("C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe")) {
    puppeteerOptions.executablePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  }

  const client = new Client({
    authStrategy: new LocalAuth({ clientId: "seranex-sales", dataPath: "./.wwebjs_auth" }),
    puppeteer: puppeteerOptions,
    webVersionCache: {
      type: "remote",
      remotePath: "https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/{version}.html",
    },
  });

  client.on("qr", (qr) => {
    console.log("\n📲 Scan this QR code with WhatsApp to connect your sales agent number:\n");
    qrcode.generate(qr, { small: true });
  });

  client.on("ready", async () => {
    console.log("\n✅ WhatsApp Sales Agent connected and active!\n");

    const leadsDb = loadLeadsDb();
    const conversations = loadConversations();

    // ── STEP 1: DISPATCH OUTREACH TO NEW LEADS (STATE 0 -> STATE 1) ──────────
    const pendingLeads = leadsDb.filter((l) => l.state === "STATE_0_LEAD_FOUND");
    console.log(`📋 Found ${pendingLeads.length} leads in STATE_0 awaiting initial outreach.`);

    for (let i = 0; i < pendingLeads.length; i++) {
      const lead = pendingLeads[i];
      const chatId = formatPhoneForWhatsApp(lead.phone);

      if (!chatId) {
        console.warn(`  ⚠ Invalid phone number for: ${lead.name}`);
        continue;
      }

      console.log(`\n[${i + 1}/${pendingLeads.length}] 📤 Sending initial pitch to "${lead.name}" (${lead.phone})...`);

      try {
        const messageToSend = lead.outreachMessage;
        if (messageToSend) {
          await client.sendMessage(chatId, messageToSend);
          lead.state = "STATE_1_OUTREACH_SENT";
          lead.outreachSentAt = new Date().toISOString();

          // Initialize conversation history
          if (!conversations[chatId]) {
            conversations[chatId] = {
              leadName: lead.name,
              phone: lead.phone,
              region: lead.region,
              state: "STATE_1_OUTREACH_SENT",
              messages: [
                {
                  role: "assistant",
                  content: messageToSend,
                  timestamp: new Date().toISOString(),
                },
              ],
            };
          }

          saveLeadsDb(leadsDb);
          saveConversations(conversations);
          console.log(`  ✅ Initial outreach delivered! [STATE_1_OUTREACH_SENT]`);

          if (i < pendingLeads.length - 1) {
            console.log(`  ⏳ Waiting ${SEND_DELAY_MS / 1000}s before next outreach...`);
            await sleep(SEND_DELAY_MS);
          }
        }
      } catch (err) {
        console.warn(`  ⚠ Failed to send message to ${lead.phone}: ${err.message}`);
      }
    }

    console.log("\n🎧 Now actively listening for replies from restaurant owners...");
  });

  // ── STEP 2: HANDLE INCOMING MESSAGES & CONVERSATIONAL REPLIES ─────────────
  client.on("message", async (msg) => {
    if (msg.isGroupMsg || msg.isStatus) return;

    const fromChatId = msg.from;
    const body = (msg.body || "").trim();
    if (!body) return;

    const leadsDb = loadLeadsDb();
    const conversations = loadConversations();

    // Check if this contact is a recognized lead
    const lead = leadsDb.find((l) => {
      const cId = formatPhoneForWhatsApp(l.phone);
      return cId === fromChatId || fromChatId.includes(l.phone.replace(/[^0-9]/g, "").slice(-8));
    });

    if (!lead && !conversations[fromChatId]) {
      // Ignore random messages from non-leads
      return;
    }

    const leadName = lead ? lead.name : conversations[fromChatId]?.leadName || "Restaurant Owner";
    console.log(`\n📩 Incoming reply from "${leadName}" (${fromChatId}): "${body}"`);

    // Ensure conversation record exists
    if (!conversations[fromChatId]) {
      conversations[fromChatId] = {
        leadName,
        phone: lead ? lead.phone : fromChatId,
        region: lead ? lead.region : "Sri Lanka",
        state: "STATE_2_IN_CONVERSATION",
        messages: [],
      };
    }

    const convo = conversations[fromChatId];
    convo.messages.push({
      role: "user",
      content: body,
      timestamp: new Date().toISOString(),
    });

    // Generate intelligent AI response
    console.log(`  🤖 Generating bilingual sales reply via ${OPENROUTER_MODEL}...`);
    const aiRaw = await getAIReply(convo.messages, leadName);
    const { replyText, state } = parseAIResponse(aiRaw);

    if (replyText) {
      await sleep(3000); // Realistic 3-second typing pause
      await client.sendMessage(fromChatId, replyText);
      console.log(`  💬 Sent: "${replyText.slice(0, 100)}..."`);

      convo.messages.push({
        role: "assistant",
        content: replyText,
        timestamp: new Date().toISOString(),
      });

      convo.state = state;
      if (lead) lead.state = state;

      saveLeadsDb(leadsDb);
      saveConversations(conversations);

      // Check if hot lead was triggered
      if (state === "STATE_3_HOT_DEAL") {
        console.log(`\n🔥 HOT DEAL DETECTED for "${leadName}"! Triggering alerts...`);
        await alertAdminHotLead(client, lead || { name: leadName, phone: convo.phone, region: convo.region }, body);
      }
    }
  });

  await client.initialize();
}

main().catch((err) => {
  console.error("Bot error:", err);
  process.exit(1);
});
