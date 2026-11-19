#!/usr/bin/env node

/**
 * Oceanway Tours - Targeted Hotel Confidential Rate Sheet Requester
 * Requests official B2B Contracted Tour Operator Tariff Sheets (2026/2027)
 * from specified partner properties with Certificate of Incorporation (PV 00380121) attached.
 */

import { sendRateSheetInquiry } from "./email.js";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";

if (existsSync(".env") && !process.env.SMTP_USER) {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

const TARGET_HOTELS = [
  {
    name: "Cinnamon Lodge Habarana & Habarana Village",
    starCategory: "5-star",
    emails: [
      "bookings@cinnamonhotels.com",
      "reachus@cinnamonhotels.com",
      "reservations@johnkeellshotels.com"
    ]
  },
  {
    name: "PALM Hotel Sri Lanka (Ahangama)",
    starCategory: "4-star",
    emails: [
      "info@palmhotelsrilanka.com",
      "miriam@palmhotelsrilanka.com"
    ]
  },
  {
    name: "Jetwing Blue & Jetwing Beach Negombo",
    starCategory: "5-star",
    emails: [
      "reservations@jetwinghotels.com",
      "resv.blue@jetwinghotels.com",
      "resv.beach@jetwinghotels.com"
    ]
  },
  {
    name: "Sentido Heritance Negombo",
    starCategory: "5-star",
    emails: [
      "hninfo@heritancehotels.com",
      "info@heritancehotels.com"
    ]
  }
];

export async function requestAllTargetedRateSheets() {
  console.log(`\n================================================================`);
  console.log(`🏨 Requesting 2026/2027 Confidential B2B Rate Sheets from Hotels`);
  console.log(`   Attaching Business Registration Certificate (PV 00380121)`);
  console.log(`================================================================\n`);

  for (const hotel of TARGET_HOTELS) {
    for (const email of hotel.emails) {
      console.log(`📨 Sending Rate Sheet Request to ${hotel.name} (${email})...`);
      const res = await sendRateSheetInquiry(email, {
        name: hotel.name,
        starCategory: hotel.starCategory,
        place_id: `target_${hotel.name.replace(/[^a-zA-Z0-9]/g, "_").toLowerCase()}`
      });

      if (res.success) {
        console.log(`   ✅ Rate sheet inquiry sent successfully to ${email}`);
      } else {
        console.warn(`   ⚠ Note: ${res.reason || "Skipped / check logs"}`);
      }

      // Safe Hostinger pacing
      console.log(`   ⏳ Waiting 12s before next send...`);
      await sleep(12000);
    }
  }

  console.log(`\n🎉 All targeted rate sheet inquiries completed!\n`);
}

// Direct execution
const isDirect = import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (isDirect) {
  requestAllTargetedRateSheets().catch(console.error);
}
