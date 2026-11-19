#!/usr/bin/env node

/**
 * Oceanway Tours - Client Itinerary Hotel Rate Inquiries
 * Dispatches formal B2B rate & availability inquiries for specific client booking:
 * 2 Adults + 1 Child (4 years old)
 * 1. Cinnamon Lodge Habarana / Habarana Village (11-13 Dec)
 * 2. PALM Hotel Sri Lanka Ahangama (15-17 Dec)
 * 3. Jetwing Hotels Negombo (17-18 Dec)
 * 4. Sentido Heritance Negombo (17-18 Dec)
 */

import { sendSpecificBookingInquiry } from "./email.js";
import { writeFileSync, existsSync, readFileSync } from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";

// Load .env if not loaded
if (existsSync(".env") && !process.env.SMTP_USER) {
  try {
    process.loadEnvFile(".env");
  } catch {}
}

export const CLIENT_HOTEL_INQUIRIES = [
  {
    id: "inq_cinnamon_habarana",
    hotelName: "Cinnamon Lodge Habarana & Habarana Village by Cinnamon",
    destination: "Habarana",
    emails: [
      "bookings@cinnamonhotels.com",
      "reachus@cinnamonhotels.com",
      "reservations@johnkeellshotels.com"
    ],
    checkIn: "11 Dec 2026",
    checkOut: "13 Dec 2026",
    nights: 2,
    adults: 2,
    childAge: 4,
    roomType: "1 Double / Twin Room",
    optionsNote: "Please quote for both Cinnamon Lodge Habarana and Habarana Village by Cinnamon on BB, HB, and FB meal plans.",
    clientAgency: "Rene Travel & Tourism (Jordan)"
  },
  {
    id: "inq_palm_ahangama",
    hotelName: "PALM Hotel Sri Lanka",
    destination: "Ahangama",
    emails: [
      "info@palmhotelsrilanka.com",
      "miriam@palmhotelsrilanka.com"
    ],
    checkIn: "15 Dec 2026",
    checkOut: "17 Dec 2026",
    nights: 2,
    adults: 2,
    childAge: 4,
    roomType: "1 Suite / Pavilion / Deluxe Room",
    optionsNote: "Please quote best B2B contracted net rates on BB and HB basis. Confirm child policy for 4-year-old sharing room.",
    clientAgency: "Rene Travel & Tourism (Jordan)"
  },
  {
    id: "inq_jetwing_negombo",
    hotelName: "Jetwing Blue & Jetwing Beach",
    destination: "Negombo",
    emails: [
      "reservations@jetwinghotels.com",
      "resv.blue@jetwinghotels.com",
      "resv.beach@jetwinghotels.com"
    ],
    checkIn: "17 Dec 2026",
    checkOut: "18 Dec 2026",
    nights: 1,
    adults: 2,
    childAge: 4,
    roomType: "1 Deluxe / Standard Room",
    optionsNote: "Please quote for both Jetwing Blue and Jetwing Beach on BB and HB meal plans.",
    clientAgency: "Rene Travel & Tourism (Jordan)"
  },
  {
    id: "inq_heritance_negombo",
    hotelName: "Sentido Heritance Negombo",
    destination: "Negombo",
    emails: [
      "hninfo@heritancehotels.com",
      "info@heritancehotels.com"
    ],
    checkIn: "17 Dec 2026",
    checkOut: "18 Dec 2026",
    nights: 1,
    adults: 2,
    childAge: 4,
    roomType: "1 Deluxe Room",
    optionsNote: "Please quote best B2B contracted net rates on BB and HB basis for Sentido Heritance Negombo.",
    clientAgency: "Rene Travel & Tourism (Jordan)"
  }
];

const LOG_PATH = "client_inquiries_log.json";

export function loadInquiriesLog() {
  if (existsSync(LOG_PATH)) {
    try {
      return JSON.parse(readFileSync(LOG_PATH, "utf-8"));
    } catch {
      return [];
    }
  }
  return [];
}

export function saveInquiriesLog(log) {
  writeFileSync(LOG_PATH, JSON.stringify(log, null, 2), "utf-8");
}

export async function dispatchAllClientInquiries() {
  console.log(`\n================================================================`);
  console.log(`📨 Oceanway Tours - Dispatching Client Itinerary Inquiries`);
  console.log(`   Client: Rene Travel & Tourism (Jordan)`);
  console.log(`   Group: 2 Adults + 1 Child (4 yrs)`);
  console.log(`================================================================\n`);

  const log = loadInquiriesLog();
  const results = [];

  for (const inq of CLIENT_HOTEL_INQUIRIES) {
    console.log(`\n🚀 [${inq.destination}] Requesting rates from ${inq.hotelName}...`);
    console.log(`   Recipients: ${inq.emails.join(", ")}`);
    console.log(`   Dates: ${inq.checkIn} - ${inq.checkOut} (${inq.nights} Nights)`);

    const result = await sendSpecificBookingInquiry({
      emails: inq.emails,
      hotelName: inq.hotelName,
      destination: inq.destination,
      checkIn: inq.checkIn,
      checkOut: inq.checkOut,
      nights: inq.nights,
      adults: inq.adults,
      childAge: inq.childAge,
      roomType: inq.roomType,
      optionsNote: inq.optionsNote,
      clientAgency: inq.clientAgency
    });

    results.push(result);

    const logEntry = {
      id: inq.id,
      hotelName: inq.hotelName,
      destination: inq.destination,
      emails: inq.emails,
      dates: `${inq.checkIn} to ${inq.checkOut}`,
      sentAt: new Date().toISOString(),
      success: result.success,
      messageId: result.messageId || null,
      error: result.reason || null
    };

    log.push(logEntry);
    saveInquiriesLog(log);

    // Hostinger anti-burst safe spacing between emails (10 seconds)
    console.log(`   ⏳ Waiting 10s before next hotel inquiry...`);
    await sleep(10000);
  }

  console.log(`\n✅ All client hotel inquiries dispatched successfully!\n`);
  return results;
}

// Direct execution
const isDirect = import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`;
if (isDirect) {
  dispatchAllClientInquiries().catch(console.error);
}
