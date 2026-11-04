#!/usr/bin/env node
/**
 * WTM Riyadh Visiting Card Outreach Pipeline
 * ────────────────────────────────────────────────────────
 * 1. Scans all JPEG images in the "visiting cards" folder
 * 2. Uses Gemini Vision (via OpenRouter) to extract contact details from each card
 * 3. Sends personalized WTM Riyadh follow-up emails via Hostinger SMTP
 * 4. Tracks sent emails to avoid duplicates across runs
 * 5. Posts a summary to Discord
 *
 * Usage:
 *   node --env-file=.env wtm_card_outreach.js
 *   node --env-file=.env wtm_card_outreach.js --dry-run   (preview only, no emails sent)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import nodemailer from "nodemailer";

// ─── CONFIG ─────────────────────────────────────────────────────────────────
const CARDS_FOLDER       = resolve("public/visiting cards");
const SENT_LOG_PATH      = "wtm_sent_log.json";
const EXTRACTED_LOG_PATH = "wtm_extracted_contacts.json";
const DELAY_BETWEEN_EMAILS_MS = 25_000; // 25s between sends (Hostinger rate limit safety)
const DRY_RUN = process.argv.includes("--dry-run");

// ─── HELPERS ────────────────────────────────────────────────────────────────
function loadJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try { return JSON.parse(readFileSync(path, "utf-8")); } catch { return fallback; }
}
function saveJson(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), "utf-8");
}

// ─── SMTP TRANSPORTER ───────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST   || "smtp.hostinger.com",
  port:   parseInt(process.env.SMTP_PORT || "465"),
  secure: process.env.SMTP_SECURE !== "false",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─── GEMINI VISION: EXTRACT CARD DATA ───────────────────────────────────────
async function extractCardData(imagePath) {
  const imageBuffer = readFileSync(imagePath);
  const base64Image = imageBuffer.toString("base64");
  const ext = imagePath.toLowerCase().endsWith(".png") ? "image/png" : "image/jpeg";

  const prompt = `This is a business / visiting card image from a travel industry event (WTM Riyadh 2026).

Please extract ALL contact details visible on this card and return ONLY a valid JSON object in this exact format (no markdown, no extra text):
{
  "name": "Full name of the person",
  "title": "Job title",
  "company": "Company / Organization name",
  "email": "primary email address (or empty string if none visible)",
  "email2": "secondary email if present (or empty string)",
  "phone": "primary phone number",
  "phone2": "secondary phone if present",
  "website": "website URL if visible",
  "country": "country or city from the card",
  "notes": "any other useful info like social handles"
}

If multiple emails are visible, put the most relevant one in "email" and any secondary in "email2".
If no email is visible on the card, return email as empty string "".`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oceanwaytours.com",
        "X-Title": "WTM Riyadh Card Outreach",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              {
                type: "image_url",
                image_url: {
                  url: `data:${ext};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 500,
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`  ⚠ Vision API error: ${errText.slice(0, 200)}`);
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";

    // Strip markdown code fences if present
    const jsonStr = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(jsonStr);
  } catch (err) {
    console.warn(`  ⚠ Failed to parse card: ${err.message}`);
    return null;
  }
}

// ─── BUILD PERSONALIZED EMAIL ─────────────────────────────────────────────
function buildEmail(contact) {
  const firstName = (contact.name || "").split(" ")[0] || "there";
  const companyPart = contact.company ? ` at ${contact.company}` : "";

  const subject = `Following Up: Sri Lanka Partnership – WTM Riyadh | Oceanway Tours`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; font-size: 15px; color: #222; line-height: 1.7; }
    .container { max-width: 680px; margin: 0 auto; padding: 20px; }
    .header { background: #0a3d62; color: #fff; padding: 24px 28px; border-radius: 8px 8px 0 0; }
    .header h1 { margin: 0; font-size: 22px; }
    .header p { margin: 4px 0 0; font-size: 13px; opacity: 0.85; }
    .body { background: #fff; padding: 28px; border: 1px solid #dde; border-top: none; border-radius: 0 0 8px 8px; }
    .body p { margin: 0 0 14px; }
    ul { margin: 0 0 14px; padding-left: 20px; }
    ul li { margin-bottom: 6px; }
    a { color: #0a6abf; }
    .cta { display: inline-block; margin: 18px 0; background: #0a3d62; color: #fff !important;
           padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: bold; }
    .signature { margin-top: 30px; padding-top: 18px; border-top: 1px solid #eee; font-size: 14px; color: #555; }
    .sig-name { font-size: 16px; font-weight: bold; color: #222; }
    .sig-title { color: #0a3d62; }
    .sig-contacts { margin-top: 8px; }
    .sig-contacts span { display: block; margin-bottom: 3px; }
    .logo-text { color: #f39c12; font-weight: bold; }
  </style>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🌴 <span class="logo-text">Oceanway Tours</span> · Sri Lanka</h1>
    <p>Your Ground Handling &amp; B2B Partner in Sri Lanka</p>
  </div>
  <div class="body">
    <p>Dear ${firstName}${companyPart ? ` &amp; the team${companyPart}` : ""},</p>

    <p>I hope you are having a productive week.</p>

    <p>I am following up on my previous email regarding our meeting at <strong>WTM Riyadh</strong>, where I had the pleasure of connecting with your team and receiving your business card.</p>

    <p>I know post-event schedules are always packed, so I wanted to bring this back to your attention. As discussed during WTM Riyadh, we at <strong>Oceanway Tours (Pvt) Ltd</strong> are eager to partner with select travel agencies in your region to support and expand your outbound tourism into <strong>Sri Lanka</strong>.</p>

    <p>We are currently sharing our exclusive B2B seasonal rates, signature curated itineraries (covering cultural, wildlife, luxury, and beach packages), and agent commission structures.</p>

    <p>If your team is open to exploring outbound packages to Sri Lanka, could you let me know if you would like me to send over:</p>
    <ul>
      <li>Our latest <strong>Sri Lanka B2B itinerary catalog</strong></li>
      <li><strong>Ground-handling rates</strong> and partner commission details</li>
    </ul>

    <p>You can also review our verified traveler feedback directly on TripAdvisor:</p>
    <p>
      <a href="https://www.tripadvisor.co.uk/Attraction_Review-g946550-d34681299-Reviews-Oceanway_Tours_Pvt_Ltd-Katana_Western_Province.html" target="_blank">
        🔗 Oceanway Tours on TripAdvisor
      </a>
    </p>

    <p>I would be delighted to connect for a quick 5-minute call or continue the conversation on WhatsApp at your convenience.</p>

    <p>Looking forward to hearing from you.</p>

    <div class="signature">
      <div class="sig-name">H. K. Pradeep Tharanga</div>
      <div class="sig-title">Chief Executive Officer / Director</div>
      <div style="margin-top:2px; color: #0a3d62; font-weight: bold;">Oceanway Tours (Pvt) Ltd</div>
      <div style="color: #777; font-size: 13px;">Negombo / Katana, Sri Lanka</div>
      <div class="sig-contacts">
        <span>📱 WhatsApp (Sri Lanka): <a href="https://wa.me/94763634022">+94 76 363 4022</a></span>
        <span>📞 Direct Call (Saudi Arabia): +966 53 781 3155</span>
        <span>✉️ Email: <a href="mailto:hello@oceanwaytours.com">hello@oceanwaytours.com</a> | <a href="mailto:oceanwaytoursadmin@gmail.com">oceanwaytoursadmin@gmail.com</a></span>
        <span>🌐 Website: <a href="https://www.oceanwaytours.com">www.oceanwaytours.com</a></span>
      </div>
    </div>
  </div>
</div>
</body>
</html>`;

  return { subject, html };
}

// ─── SEND EMAIL ───────────────────────────────────────────────────────────
async function sendOutreachEmail(toEmail, contact, retries = 2) {
  const { subject, html } = buildEmail(contact);
  const fromUser = process.env.SMTP_USER || "b2b@oceanwaytours.com";

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await transporter.sendMail({
        from: `"H. K. Pradeep Tharanga – Oceanway Tours" <${fromUser}>`,
        to: toEmail,
        subject,
        html,
      });
      return true;
    } catch (err) {
      if (err.message.includes("Ratelimit") && attempt < retries) {
        console.warn(`    ⏳ Rate limited, waiting 90s before retry ${attempt}/${retries}...`);
        await sleep(90_000);
      } else {
        console.warn(`    ⚠ Send failed (${toEmail}): ${err.message}`);
        return false;
      }
    }
  }
  return false;
}

// ─── DISCORD SUMMARY ──────────────────────────────────────────────────────
async function postDiscordSummary(results) {
  const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
  if (!webhookUrl) return;

  const sent    = results.filter(r => r.status === "sent");
  const noEmail = results.filter(r => r.status === "no_email");
  const failed  = results.filter(r => r.status === "failed");
  const dup     = results.filter(r => r.status === "duplicate");

  const embed = {
    title: "📧 WTM Riyadh – Card Outreach Campaign Complete",
    color: 0x00b894,
    fields: [
      { name: "✅ Emails Sent",         value: `${sent.length}`,    inline: true },
      { name: "⚠ No Email Found",       value: `${noEmail.length}`, inline: true },
      { name: "❌ Failed",              value: `${failed.length}`,  inline: true },
      { name: "🔁 Duplicates Skipped",  value: `${dup.length}`,     inline: true },
      { name: "📇 Total Cards Scanned", value: `${results.length}`, inline: true },
    ],
    description: sent.length > 0
      ? `**Contacts reached:**\n${sent.slice(0, 15).map(r => `• ${r.name || "?"} (${r.company || "?"}) → ${r.email}`).join("\n")}`
      : "No emails were sent.",
    footer: { text: "Oceanway Tours B2B Outreach · WTM Riyadh 2026" },
    timestamp: new Date().toISOString(),
  };

  await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] }),
  }).catch(() => {});
}

// ─── MAIN ─────────────────────────────────────────────────────────────────
async function main() {
  console.log(`\n${"═".repeat(65)}`);
  console.log(`📇 WTM Riyadh Visiting Card Outreach${DRY_RUN ? " [DRY-RUN]" : ""}`);
  console.log(`${"═".repeat(65)}\n`);

  const sentLog       = loadJson(SENT_LOG_PATH, {});        // { email: sent_at }
  const extractedLog  = loadJson(EXTRACTED_LOG_PATH, {});   // { filename: contact }
  const results       = [];

  // Get all image files
  const imageFiles = readdirSync(CARDS_FOLDER).filter(f =>
    /\.(jpe?g|png|webp)$/i.test(f)
  );

  console.log(`📂 Found ${imageFiles.length} visiting card images in "${CARDS_FOLDER}"\n`);

  for (let i = 0; i < imageFiles.length; i++) {
    const filename = imageFiles[i];
    const imagePath = join(CARDS_FOLDER, filename);
    const prefix = `[${i + 1}/${imageFiles.length}]`;

    console.log(`${prefix} 🔍 ${filename}`);

    // Use cached extraction if available
    let contact = extractedLog[filename];
    if (!contact) {
      process.stdout.write(`       🤖 Extracting card details via AI...`);
      contact = await extractCardData(imagePath);
      if (contact) {
        extractedLog[filename] = contact;
        saveJson(EXTRACTED_LOG_PATH, extractedLog);
        process.stdout.write(` ✓\n`);
      } else {
        process.stdout.write(` ✗ (extraction failed)\n`);
        results.push({ filename, status: "failed", email: "", name: "", company: "" });
        continue;
      }
    } else {
      console.log(`       📋 Cached: ${contact.name || "?"} (${contact.company || "?"})`);
    }

    const email  = (contact.email  || "").trim().toLowerCase();
    const email2 = (contact.email2 || "").trim().toLowerCase();

    console.log(`       👤 ${contact.name || "?"} · ${contact.title || ""}`);
    console.log(`       🏢 ${contact.company || "?"} · ${contact.country || ""}`);
    console.log(`       ✉️  ${email || "(no email found)"}`);

    if (!email) {
      console.log(`       ⚠ Skipping — no email address on card\n`);
      results.push({ filename, status: "no_email", ...contact });
      continue;
    }

    // Check for duplicates
    if (sentLog[email]) {
      console.log(`       🔁 Already sent on ${sentLog[email]} — skipping\n`);
      results.push({ filename, status: "duplicate", email, ...contact });
      continue;
    }

    if (DRY_RUN) {
      console.log(`       ✅ [DRY-RUN] Would send to: ${email}\n`);
      results.push({ filename, status: "dry_run", email, ...contact });
      continue;
    }

    // Send primary email
    const ok = await sendOutreachEmail(email, contact);
    if (ok) {
      sentLog[email] = new Date().toISOString();
      saveJson(SENT_LOG_PATH, sentLog);
      console.log(`       ✅ Email sent → ${email}`);
      results.push({ filename, status: "sent", email, ...contact });
    } else {
      results.push({ filename, status: "failed", email, ...contact });
    }

    // Send to secondary email too if different
    if (email2 && email2 !== email && !sentLog[email2]) {
      await sleep(5_000);
      const ok2 = await sendOutreachEmail(email2, contact);
      if (ok2) {
        sentLog[email2] = new Date().toISOString();
        saveJson(SENT_LOG_PATH, sentLog);
        console.log(`       ✅ Also sent → ${email2} (secondary)`);
      }
    }

    console.log();

    // Rate-limit safe delay between emails
    if (i < imageFiles.length - 1) {
      console.log(`       ⏳ Waiting ${DELAY_BETWEEN_EMAILS_MS / 1000}s before next email...\n`);
      await sleep(DELAY_BETWEEN_EMAILS_MS);
    }
  }

  // ─── SUMMARY ──────────────────────────────────────────────────────────
  const sent    = results.filter(r => r.status === "sent").length;
  const noEmail = results.filter(r => r.status === "no_email").length;
  const failed  = results.filter(r => r.status === "failed").length;
  const dup     = results.filter(r => r.status === "duplicate").length;

  console.log(`\n${"═".repeat(65)}`);
  console.log(`  📊 CAMPAIGN SUMMARY`);
  console.log(`${"═".repeat(65)}`);
  console.log(`  ✅ Emails Sent:         ${sent}`);
  console.log(`  ⚠  No Email on Card:   ${noEmail}`);
  console.log(`  ❌ Failed Sends:        ${failed}`);
  console.log(`  🔁 Duplicates Skipped:  ${dup}`);
  console.log(`  📇 Total Cards:         ${imageFiles.length}`);
  console.log(`${"═".repeat(65)}\n`);

  // Save full results log
  saveJson("wtm_results.json", results);

  // Discord summary
  await postDiscordSummary(results);
  console.log(`📋 Full results saved to wtm_results.json`);
  console.log(`📋 Extracted contacts saved to wtm_extracted_contacts.json`);
}

main().catch(err => {
  console.error("Fatal:", err);
  process.exit(1);
});
