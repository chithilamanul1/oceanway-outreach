#!/usr/bin/env node

/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * Oceanway Tours - Autonomous Continuous Island-Wide Rate Hunter
 * ─────────────────────────────────────────────────────────────────────────────
 * • Continuous 24/7 worker: Never stops ("dont stop untill i stop")
 * • Pacing: Exactly ~100 hotels per hour (36-second intervals between sends)
 * • Coverage: Whole island (65+ destinations across all 9 provinces)
 * • Focus: 4-star & 3-star hotels (5-star capped at 1-2 per town)
 * • Attachments: Always attaches official Certificate of Incorporation (PV 00380121)
 * • Auto-start ready: Triggered by start_bot.bat & Windows Startup
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { scrapeHotelEmails } from "./email_scraper.js";
import { sendRateSheetInquiry, verifyDomainMX } from "./email.js";
import { notifyHotelDiscovered, notifyInquirySent } from "./discord_notifier.js";

// ─── 65+ GRANULAR TOURIST DESTINATIONS ACROSS ALL OF SRI LANKA ───────────────
export const EXPANDED_SRI_LANKA_REGIONS = [
  // 1. Cultural Triangle & Heritage (Central/North Central)
  "Sigiriya",
  "Dambulla",
  "Kandalama",
  "Habarana",
  "Anuradhapura",
  "Mihintale",
  "Polonnaruwa",
  "Giritale",
  "Kurunegala",
  "Yapahuwa",

  // 2. Hill Country, Tea Country & Waterfalls (Central / Uva)
  "Ella",
  "Nuwara Eliya",
  "Bandarawela",
  "Haputale",
  "Kandy",
  "Peradeniya",
  "Digana",
  "Teldeniya",
  "Matale",
  "Hatton",
  "Maskeliya",
  "Nallathanniya",
  "Talawakele",
  "Gampola",
  "Nawalapitiya",
  "Wellawaya",
  "Badulla",
  "Mahiyanganaya",

  // 3. Wildlife, Safaris & Rainforests
  "Yala",
  "Tissamaharama",
  "Kirinda",
  "Kataragama",
  "Udawalawe",
  "Wilpattu",
  "Sinharaja",
  "Kitulgala",
  "Minneriya",
  "Kaudulla",
  "Wasgamuwa",
  "Bundala",

  // 4. South & South-West Coast (Major Tourist Strip)
  "Bentota",
  "Induruwa",
  "Kosgoda",
  "Balapitiya",
  "Ambalangoda",
  "Hikkaduwa",
  "Galle",
  "Unawatuna",
  "Thalpe",
  "Koggala",
  "Ahangama",
  "Midigama",
  "Weligama",
  "Mirissa",
  "Matara",
  "Dondra",
  "Dickwella",
  "Hiriketiya",
  "Tangalle",
  "Rekawa",
  "Hambantota",

  // 5. East Coast & Surfing Hubs
  "Trincomalee",
  "Nilaveli",
  "Uppuveli",
  "Pasikuda",
  "Kalkudah",
  "Batticaloa",
  "Arugam Bay",
  "Pottuvil",

  // 6. Northern Province
  "Jaffna",
  "Point Pedro",
  "Chavakachcheri",
  "Kilinochchi",
  "Mannar",
  "Vavuniya",

  // 7. North-Western & Western Hubs
  "Kalpitiya",
  "Alankuda",
  "Chilaw",
  "Marawila",
  "Waikkal",
  "Puttalam",
  "Colombo",
  "Negombo",
  "Mount Lavinia",
  "Wadduwa",
  "Kalutara",
  "Beruwala",
  "Panadura",
  "Moratuwa",
  "Ja-Ela",
  "Wattala",
  "Seeduwa",
  "Katunayake",
  "Ratnapura",
  "Embilipitiya"
];

const HOTELS_DB_PATH = "hotels_db.json";
const SEEN_HOTELS_PATH = "seen_hotels.json";
const WORKER_STATE_PATH = "worker_state.json";

// Target 100 hotels per hour -> 3600 seconds / 100 = 36 seconds between emails
const DELAY_BETWEEN_EMAILS_MS = 36_000;

// ─── HELPERS ─────────────────────────────────────────────────────────────────
function loadHotelsDb() {
  if (!existsSync(HOTELS_DB_PATH)) return [];
  try { return JSON.parse(readFileSync(HOTELS_DB_PATH, "utf-8")); } catch { return []; }
}

function saveHotelsDb(hotels) {
  writeFileSync(HOTELS_DB_PATH, JSON.stringify(hotels, null, 2), "utf-8");
}

function loadSeenHotels() {
  if (!existsSync(SEEN_HOTELS_PATH)) return new Set();
  try { return new Set(JSON.parse(readFileSync(SEEN_HOTELS_PATH, "utf-8"))); } catch { return new Set(); }
}

function saveSeenHotels(seenSet) {
  writeFileSync(SEEN_HOTELS_PATH, JSON.stringify([...seenSet], null, 2), "utf-8");
}

function loadWorkerState() {
  if (!existsSync(WORKER_STATE_PATH)) {
    return {
      startedAt: new Date().toISOString(),
      cycleCount: 0,
      totalInquiriesSent: 0,
      totalHotelsDiscovered: 0,
      currentRegionIndex: 0,
      lastActiveAt: new Date().toISOString()
    };
  }
  try { return JSON.parse(readFileSync(WORKER_STATE_PATH, "utf-8")); } catch {
    return { startedAt: new Date().toISOString(), cycleCount: 0, totalInquiriesSent: 0, totalHotelsDiscovered: 0, currentRegionIndex: 0, lastActiveAt: new Date().toISOString() };
  }
}

function saveWorkerState(state) {
  state.lastActiveAt = new Date().toISOString();
  writeFileSync(WORKER_STATE_PATH, JSON.stringify(state, null, 2), "utf-8");
}

// ─── AI REGIONAL HOTEL DISCOVERY (GEMINI 2.5 FLASH) ─────────────────────────
async function discoverHotelsForRegion(region, starCategories = ["4-star", "3-star"]) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return [];

  const prompt = `You are a professional Sri Lanka inbound travel DMC contracting specialist.
List well-established ${starCategories.join(" and ")} hotels, boutique resorts, and villas located in "${region}", Sri Lanka for B2B contracted tour operator procurement.

Exclude budget homestays, private guesthouses, and dorms.
We need verified hotel properties suitable for international travel agency itineraries.

For each hotel, output:
- name: Official hotel name
- star_category: Exactly "4-star", "3-star", or "5-star"
- star_rating: 4, 3, or 5
- website: Official website URL (e.g. https://...) or empty string
- phone: Reservation / front desk phone
- address: Street address or area in ${region}

Provide up to 8-12 hotels for this region.
Return ONLY a valid JSON array of objects, with NO surrounding markdown or extra text.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://oceanwaytours.com",
        "X-Title": "Oceanway Islandwide Continuous Hunter",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: 2500,
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    const cleanJson = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    return JSON.parse(cleanJson);
  } catch (err) {
    console.warn(`  ⚠ Discovery query error for ${region}:`, err.message);
    return [];
  }
}

// ─── AI EMAIL RESOLVER FALLBACK ──────────────────────────────────────────────
async function resolveSingleHotelEmail(hotelName, region, website) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  const prompt = `What is the official reservations or sales contracting email address for "${hotelName}" located in ${region}, Sri Lanka (Website: ${website || "none"})?
Return ONLY a JSON object: { "email": "reservations@...", "phone": "+94..." } with valid email, or empty string if unknown.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const clean = (data.choices?.[0]?.message?.content || "").replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
    const parsed = JSON.parse(clean);
    return (parsed.email && parsed.email.includes("@")) ? parsed.email.trim().toLowerCase() : null;
  } catch {
    return null;
  }
}

let isWorkerActive = false;
let stopRequested = false;

export function isContinuousHarvesterRunning() {
  return isWorkerActive;
}

export function stopContinuousHarvester() {
  stopRequested = true;
  isWorkerActive = false;
  try {
    const state = loadWorkerState();
    state.isRunning = false;
    saveWorkerState(state);
  } catch {}
}

export function startContinuousHarvester() {
  if (isWorkerActive) return false;
  stopRequested = false;
  runContinuousHarvester().catch((err) => console.error("Continuous worker error:", err));
  return true;
}

async function interruptibleSleep(ms) {
  const step = 500;
  let elapsed = 0;
  while (elapsed < ms) {
    if (stopRequested) break;
    await sleep(Math.min(step, ms - elapsed));
    elapsed += step;
  }
}

// ─── CONTINUOUS AUTONOMOUS ENGINE ────────────────────────────────────────────
export async function runContinuousHarvester() {
  isWorkerActive = true;
  stopRequested = false;
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🌴 Oceanway Tours - Continuous Island-Wide Hotel Rate Hunter (24/7)`);
  console.log(`   Speed Target: ~100 hotels per hour (36-second intervals)`);
  console.log(`   Coverage: 65+ Sri Lanka destinations across all 9 provinces`);
  console.log(`   Status: RUNNING CONTINUOUSLY until stopped`);
  console.log(`${"═".repeat(70)}\n`);

  const workerState = loadWorkerState();
  workerState.isRunning = true;
  saveWorkerState(workerState);
  const hotelsDb = loadHotelsDb();
  const seen = loadSeenHotels();

  try {
    while (!stopRequested) {
      workerState.cycleCount++;
      console.log(`\n🔄 ═══ Starting Island-Wide Sweep Cycle #${workerState.cycleCount} ═══\n`);

      for (let rIdx = 0; rIdx < EXPANDED_SRI_LANKA_REGIONS.length; rIdx++) {
        if (stopRequested) break;
        const region = EXPANDED_SRI_LANKA_REGIONS[rIdx];
        workerState.currentRegionIndex = rIdx;
        workerState.currentRegionName = region;
        saveWorkerState(workerState);

      const existing4Star = hotelsDb.filter(h => h.region === region && h.star_category === "4-star").length;
      const existing3Star = hotelsDb.filter(h => h.region === region && h.star_category === "3-star").length;
      const existing5Star = hotelsDb.filter(h => h.region === region && h.star_category === "5-star").length;

      console.log(`\n📍 [${rIdx + 1}/${EXPANDED_SRI_LANKA_REGIONS.length}] Region: ${region.toUpperCase()} (DB: 4★:${existing4Star} | 3★:${existing3Star} | 5★:${existing5Star})`);

      // Inventory targets: up to 15 for 4-star, up to 15 for 3-star, capped at 1-2 for 5-star
      const categoriesToHunt = [];
      if (existing4Star < 15) categoriesToHunt.push("4-star");
      if (existing3Star < 15) categoriesToHunt.push("3-star");
      if (existing5Star < 2) categoriesToHunt.push("5-star");

      if (categoriesToHunt.length === 0) {
        console.log(`   ✓ Quota already satisfied for ${region}. Moving to next destination.`);
        continue;
      }

      const candidates = await discoverHotelsForRegion(region, categoriesToHunt);
      console.log(`   📋 Found ${candidates.length} candidate property(s) in ${region}`);

      for (const candidate of candidates) {
        if (stopRequested) break;
        if (!candidate.name) continue;
        const hotelKey = `${candidate.name.trim().toLowerCase()}__${region.toLowerCase()}`;
        if (seen.has(hotelKey)) continue;

        // Strictly respect 5-star cap
        if (candidate.star_category === "5-star") {
          const current5s = hotelsDb.filter(h => h.region === region && h.star_category === "5-star").length;
          if (current5s >= 2) {
            seen.add(hotelKey);
            saveSeenHotels(seen);
            continue;
          }
        }

        console.log(`\n   🏨 ${candidate.name} [${candidate.star_category || "4-star"}]`);
        console.log(`      📍 ${candidate.address || region}`);
        console.log(`      🌐 ${candidate.website || "(no website)"}`);

        let primaryEmail = null;
        let allEmails = [];

        // 1. Try web scraping first
        if (candidate.website && candidate.website.startsWith("http")) {
          process.stdout.write(`      🔎 Scraping website for email... `);
          try {
            const scrapeRes = await scrapeHotelEmails(candidate.website);
            primaryEmail = scrapeRes.primaryEmail;
            allEmails = scrapeRes.allEmails;
            if (primaryEmail) console.log(`✓ Found: ${primaryEmail}`);
            else console.log(`✗ none`);
          } catch {
            console.log(`⚠ scrape failed`);
          }
        }

        // 2. If no email scraped, use AI resolver fallback
        if (!primaryEmail) {
          process.stdout.write(`      🤖 Resolving official reservations email via AI... `);
          primaryEmail = await resolveSingleHotelEmail(candidate.name, region, candidate.website);
          if (primaryEmail) {
            console.log(`✓ Resolved: ${primaryEmail}`);
            allEmails = [primaryEmail];
          } else {
            console.log(`✗ not found`);
          }
        }

        // 3. Pre-validate email domain MX records to prevent bounces
        if (primaryEmail) {
          const mxCheck = await verifyDomainMX(primaryEmail);
          if (!mxCheck.valid) {
            console.log(`      🚫 Rejecting unverifiable email domain ${primaryEmail} (${mxCheck.reason}). Skipping to prevent bounces.`);
            primaryEmail = null;
            allEmails = [];
          }
        }

        const hotelRecord = {
          place_id: `ow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: candidate.name,
          star_category: candidate.star_category || "4-star",
          star_rating: candidate.star_rating || (candidate.star_category === "3-star" ? 3 : 4),
          region: region,
          address: candidate.address || `${region}, Sri Lanka`,
          phone: candidate.phone || null,
          intl_phone: candidate.phone || null,
          website: candidate.website || null,
          email: primaryEmail,
          all_emails: allEmails,
          status: "DISCOVERED",
          rate_sheets: [],
          created_at: new Date().toISOString()
        };

        hotelsDb.push(hotelRecord);
        saveHotelsDb(hotelsDb);
        seen.add(hotelKey);
        saveSeenHotels(seen);

        workerState.totalHotelsDiscovered++;
        notifyHotelDiscovered(hotelRecord).catch(() => {});

        // 3. Dispatch formal rate inquiry email with Business Registration attached
        if (primaryEmail) {
          console.log(`      🚀 Sending B2B Rate Sheet inquiry email → ${primaryEmail}...`);
          let sendRes = await sendRateSheetInquiry(primaryEmail, {
            name: candidate.name,
            starCategory: candidate.star_category || "4-star",
            place_id: hotelRecord.place_id
          });

          if (sendRes.success) {
            hotelRecord.status = "EMAIL_SENT";
            hotelRecord.email_sent_at = new Date().toISOString();
            workerState.totalInquiriesSent++;
            saveHotelsDb(hotelsDb);
            notifyInquirySent(hotelRecord, primaryEmail).catch(() => {});
            console.log(`      ✅ Sent successfully with Business Registration (PV 00380121) attached!`);
            console.log(`      ⏳ 100/hr Pacing: waiting ${DELAY_BETWEEN_EMAILS_MS / 1000}s before next hotel...`);
            await interruptibleSleep(DELAY_BETWEEN_EMAILS_MS);
          } else if (sendRes.reason && sendRes.reason.includes("Ratelimit")) {
            console.warn(`      ⏳ Hostinger rate limit pause: waiting 90s cooldown...`);
            await interruptibleSleep(90_000);
          }
        }

        saveWorkerState(workerState);
        await interruptibleSleep(1500);
      }
    }

    if (stopRequested) break;
    console.log(`\n🏁 Cycle #${workerState.cycleCount} finished!`);
    console.log(`   Total Hotels in DB: ${hotelsDb.length}`);
    console.log(`   Total Inquiries Sent: ${workerState.totalInquiriesSent}`);
    console.log(`   Short 5-minute breather before starting next island sweep...`);
    await interruptibleSleep(300_000);
  }
  } finally {
    isWorkerActive = false;
    workerState.isRunning = false;
    saveWorkerState(workerState);
    console.log(`🛑 Autonomous continuous worker stopped.`);
  }
}

// Direct execution
const isDirect = import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (isDirect) {
  runContinuousHarvester().catch((err) => {
    console.error("Fatal continuous worker error:", err);
    process.exit(1);
  });
}
