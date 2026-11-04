#!/usr/bin/env node

// ═══════════════════════════════════════════════════════════════════════════════
// Seranex Solutions - Autonomous Restaurant Lead Generation & Outreach Engine
// Targets local restaurants & cafes in Sri Lanka (Seeduwa, Negombo, Ja-Ela,
// Gampaha, Colombo) with NO website or only social media pages.
// Generates personalized bilingual (Sinhala + English) outreach offering
// Custom Website + Cinematic Video Ad New Year packages.
// ═══════════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// ─── CONFIGURATION ──────────────────────────────────────────────────────────
const TARGET_REGIONS = ["Seeduwa", "Negombo", "Ja-Ela", "Gampaha", "Colombo"];
const SEARCH_KEYWORDS = ["restaurants near", "cafes near", "family restaurant in", "seafood restaurant in"];

const RESTAURANTS_DB_PATH = "restaurant_leads_db.json";
const SEEN_PLACES_PATH = "restaurant_seen_places.json";

// API Keys & Config
const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "google/gemini-2.5-flash";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_HOT_LEADS_WEBHOOK || process.env.DISCORD_WEBHOOK_URL;

// CLI Flags
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const regionArg = args.find((a) => a.startsWith("--region="));
const SELECTED_REGIONS = regionArg ? [regionArg.split("=")[1]] : TARGET_REGIONS;

// ─── SOCIAL MEDIA DOMAIN CHECK ─────────────────────────────────────────────
const SOCIAL_MEDIA_DOMAINS = [
  "facebook.com",
  "fb.com",
  "instagram.com",
  "tiktok.com",
  "tripadvisor.com",
  "tripadvisor.co.uk",
  "yelp.com",
  "youtube.com",
  "google.com",
  "business.site"
];

function isRealWebsite(url) {
  if (!url || typeof url !== "string") return false;
  const clean = url.trim().toLowerCase();
  if (clean === "" || clean === "none" || clean === "null") return false;
  return !SOCIAL_MEDIA_DOMAINS.some(domain => clean.includes(domain));
}

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

function loadSeenPlaces() {
  if (!existsSync(SEEN_PLACES_PATH)) return new Set();
  try {
    return new Set(JSON.parse(readFileSync(SEEN_PLACES_PATH, "utf-8")));
  } catch {
    return new Set();
  }
}

function saveSeenPlaces(seenSet) {
  writeFileSync(SEEN_PLACES_PATH, JSON.stringify([...seenSet], null, 2), "utf-8");
}

// ─── GOOGLE PLACES API ──────────────────────────────────────────────────────
async function searchPlaces(query) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/textsearch/json");
  url.searchParams.set("query", query);
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const data = await res.json();
    if (data.status !== "OK" && data.status !== "ZERO_RESULTS") {
      console.warn(`  ⚠ Places API warning (${data.status}) for: "${query}"`);
      return [];
    }
    return data.results || [];
  } catch (err) {
    console.warn(`  ⚠ Places search error: ${err.message}`);
    return [];
  }
}

async function getPlaceDetails(placeId) {
  const url = new URL("https://maps.googleapis.com/maps/api/place/details/json");
  url.searchParams.set("place_id", placeId);
  url.searchParams.set(
    "fields",
    "name,formatted_address,formatted_phone_number,international_phone_number,website,rating,user_ratings_total,types,url"
  );
  url.searchParams.set("key", GOOGLE_PLACES_API_KEY);

  try {
    const res = await fetch(url.toString());
    if (!res.ok) return null;
    const data = await res.json();
    return data.result || null;
  } catch (err) {
    console.warn(`  ⚠ Place details error: ${err.message}`);
    return null;
  }
}

// ─── BILINGUAL OUTREACH GENERATOR (OPENROUTER AI) ─────────────────────────
async function generateBilingualOutreach(lead) {
  const prompt = `You are an expert sales strategist for "Seranex Solutions" (seranex.lk), a premium web development & creative agency in Sri Lanka.
We are reaching out to a local restaurant in Sri Lanka via WhatsApp to offer our high-converting modern website design + cinematic video advertisement New Year special package.

Target Business:
- Name: "${lead.name}"
- Location: "${lead.region}" (${lead.address})
- Rating: ${lead.rating || "Popular"} (${lead.userRatingsTotal || 0} Google reviews)
- Current Online Presence: ${lead.hasSocialOnly ? "Has Facebook/Instagram, but NO dedicated website" : "No website found on Google"}

Instructions:
1. Write a natural, highly engaging, respectful BILINGUAL (Sinhala + English) WhatsApp outreach message.
2. Structure:
   - Greeting: "Ayubowan ${lead.name} Team!"
   - Observation: Politely mention in natural conversational Sinhala that their restaurant has great food/reviews, but when customers search on Google, they don't have a modern website (or only have a Facebook page).
   - The Solution: Explain that Seranex Solutions builds fast, mobile-friendly websites and cinematic video ads that help local Sri Lankan restaurants double dine-in and delivery orders.
   - Special Offer: Mention the exclusive New Year Bundle (Custom Website + Cinematic Video Ad at an all-in-one special rate).
   - Social Proof: Mention our verified work with local tourism & hospitality brands (e.g. Oceanway Tours, local cafes) and portfolio at https://seranex.lk.
   - Call to Action: Ask if we can send a quick 30-second preview/demo of what we can create for their restaurant.
3. Keep it punchy, friendly, professional, and formatted nicely for WhatsApp (use emojis and bolding tastefully).
4. Do NOT output robotic or Google-translated Sinhala. Use natural conversational Sinhala mixed with professional English.

Output ONLY the final WhatsApp message text. No extra explanations or markdown blocks.`;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
        "Content-Type": "application/json",
        "HTTP-Referer": "https://seranex.lk",
        "X-Title": "Seranex Restaurant Outreach Engine",
      },
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages: [{ role: "user", content: prompt }],
        max_tokens: 450,
        temperature: 0.7,
      }),
    });

    if (!res.ok) {
      console.warn(`  ⚠ OpenRouter error: ${res.status}`);
      return getFallbackMessage(lead);
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content?.trim();
    return content || getFallbackMessage(lead);
  } catch (err) {
    console.warn(`  ⚠ Failed to generate AI outreach: ${err.message}`);
    return getFallbackMessage(lead);
  }
}

function getFallbackMessage(lead) {
  const hasFb = lead.hasSocialOnly;
  return `Ayubowan ${lead.name} Team! 🍽️✨

මම Seranex Solutions (seranex.lk) එකෙන් සම්බන්ධ වෙන්නේ. මම දැක්කා ඔයාලගේ restaurant එකට Google reviews ගොඩක් හොඳයි, හැබැයි ${hasFb ? "Facebook page එකක් තිබුණට තාම dedicated modern website එකක් නැහැ කියලා" : "තාම official website එකක් නැහැ කියලා"}. 

Google එකේ search කරන local & foreign customers ලා menus, location සහ direct orders වලට කෙලින්ම යන්නේ website තියෙන තැන් වලට. 🚀

අපි මේ New Year එකට Sri Lankan restaurants & cafes වලට විශේෂ **Website + Cinematic Video Ad All-in-One Package** එකක් දෙනවා:
✅ 1-2 Days Fast Delivery
✅ Modern Mobile Menu & Direct WhatsApp Ordering
✅ Cinematic 4K Video Advertisement for Reels & TikTok
✅ 1 Year Free Domain & High-speed Cloud Hosting

අපි Oceanway Tours සහ local brands වලට කරපු portfolio එක බලන්න: https://seranex.lk

ඔයාලගේ restaurant එකට අපි කරන්න පුළුවන් quick 30-second preview එකක් WhatsApp එකට share කරන්නද? 😊`;
}

// ─── DISCORD NOTIFIER ───────────────────────────────────────────────────────
async function notifyDiscordNewLead(lead) {
  if (!DISCORD_WEBHOOK_URL) return;

  const embed = {
    title: `🍽️ New Restaurant Lead Found: ${lead.name}`,
    color: 0xff6b6b,
    fields: [
      { name: "Region", value: lead.region, inline: true },
      { name: "Rating", value: `⭐ ${lead.rating || "N/A"} (${lead.userRatingsTotal || 0} reviews)`, inline: true },
      { name: "Phone", value: lead.phone || "No phone", inline: true },
      { name: "Website Status", value: lead.hasSocialOnly ? `Only Social Media (${lead.rawWebsite})` : "❌ NO WEBSITE", inline: false },
      { name: "Address", value: lead.address || "N/A", inline: false },
      { name: "State", value: "🟡 STATE_0_LEAD_FOUND", inline: true },
    ],
    footer: { text: "Seranex Solutions • Lead Engine" },
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

// ─── MAIN SCRAPER & HARVESTER ───────────────────────────────────────────────
async function main() {
  console.log("═".repeat(70));
  console.log("  🚀 SERANEX SOLUTIONS: RESTAURANT LEAD GENERATION & OUTREACH ENGINE");
  console.log(`  Target Regions: ${SELECTED_REGIONS.join(", ")}`);
  console.log(`  Model: ${OPENROUTER_MODEL} | Mode: ${DRY_RUN ? "DRY-RUN (Preview)" : "LIVE DISCOVERY"}`);
  console.log("═".repeat(70) + "\n");

  if (!GOOGLE_PLACES_API_KEY) {
    console.error("✖ Missing GOOGLE_PLACES_API_KEY in .env");
    process.exit(1);
  }

  const leadsDb = loadLeadsDb();
  const seenPlaces = loadSeenPlaces();
  let newLeadsFound = 0;

  for (const region of SELECTED_REGIONS) {
    console.log(`\n📍 Scanning Region: ${region.toUpperCase()}...`);

    for (const keyword of SEARCH_KEYWORDS) {
      const query = `${keyword} ${region}`;
      console.log(`   🔎 Query: "${query}"`);

      const places = await searchPlaces(query);
      console.log(`      Found ${places.length} places on Maps`);

      for (const place of places) {
        if (seenPlaces.has(place.place_id)) continue;
        seenPlaces.add(place.place_id);

        // Fetch detailed info
        await sleep(250); // Respect API pacing
        const details = await getPlaceDetails(place.place_id);
        if (!details) continue;

        const rawWebsite = details.website || "";
        const hasRealWeb = isRealWebsite(rawWebsite);

        // FILTER: Keep only businesses WITHOUT a real website
        if (hasRealWeb) {
          continue; // Skip businesses that already have a proper website
        }

        const phone = details.formatted_phone_number || details.international_phone_number || "";
        if (!phone) {
          continue; // Cannot outreach without a phone number
        }

        const lead = {
          placeId: place.place_id,
          name: details.name,
          region,
          address: details.formatted_address,
          phone,
          rawWebsite,
          hasSocialOnly: !hasRealWeb && rawWebsite.length > 0,
          rating: details.rating,
          userRatingsTotal: details.user_ratings_total,
          googleMapsUrl: details.url,
          state: "STATE_0_LEAD_FOUND",
          discoveredAt: new Date().toISOString(),
          outreachMessage: null,
          history: [],
        };

        console.log(`      ✨ Hot Prospect Found: "${lead.name}" (${region})`);
        console.log(`         Phone: ${lead.phone} | Status: ${lead.hasSocialOnly ? "Social Page Only" : "No Website"}`);

        // Generate tailored bilingual outreach message
        process.stdout.write("         🤖 Crafting AI bilingual pitch...");
        lead.outreachMessage = await generateBilingualOutreach(lead);
        process.stdout.write(" Done!\n");

        leadsDb.push(lead);
        newLeadsFound++;

        if (!DRY_RUN) {
          await notifyDiscordNewLead(lead);
        }

        saveLeadsDb(leadsDb);
        saveSeenPlaces(seenPlaces);
      }
    }
  }

  console.log("\n" + "═".repeat(70));
  console.log("  📊 DISCOVERY RUN COMPLETED");
  console.log(`  ⭐ New Qualified Leads Found: ${newLeadsFound}`);
  console.log(`  📁 Total Qualified Prospects in Database: ${leadsDb.length}`);
  console.log(`  💾 Saved to: ${RESTAURANTS_DB_PATH}`);
  console.log("═".repeat(70) + "\n");
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
