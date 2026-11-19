import XLSX from "xlsx";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure costing_sheets directory exists
const outputDir = resolve(__dirname, "costing_sheets");
if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });
const filePath = resolve(outputDir, "Rene_Travel_2A1C_SriLanka_Costing.xlsx");

const wb = XLSX.utils.book_new();

// ─── 1. CLIENT QUOTATION & PACKAGE SUMMARY ──────────────────────────────────
const summaryData = [
  ["OCEANWAY TOURS (PVT) LTD - B2B TOUR COSTING & QUOTATION"],
  ["Company Reg No: PV 00380121 | Inbound Tour Operator | Colombo, Sri Lanka"],
  ["Hotline: +94 76 363 4022 | WhatsApp: +94 71 177 0186 | Email: b2b@oceanwaytours.com"],
  [],
  ["CLIENT / AGENT DETAILS", "", "TOUR DETAILS", ""],
  ["Partner Agency:", "Rene Travel and Tourism (Amman, Jordan)", "Tour Code:", "OW-RENE-2A1C-DEC26"],
  ["Contact Person:", "Haya AbuHamad (Senior Tourism Manager)", "Duration:", "8 Days / 7 Nights"],
  ["Group Size:", "2 Adults + 1 Child (Age: 4 Years)", "Travel Period:", "11 Dec 2026 – 18 Dec 2026"],
  ["Vehicle Type:", "Dedicated Private A/C Sedan / Luxury Van", "Driver/Guide:", "English-speaking Chauffeur Guide"],
  ["Ella Hotel Note:", "Hotel in Ella booked directly by client ($0.00)", "Status:", "Urgent B2B Quotation"],
  [],
  ["PACKAGE PRICING SUMMARY (USD)", "", "", "", ""],
  ["Option", "Hotel Selection (Habarana / Ahangama / Negombo)", "Meal Plan", "Total NET Cost (USD)", "Selling Price (15% Markup)", "Per Adult (Twin/Dbl)", "Child (4 yrs)"],
  [
    "Option 1 (5★ Luxury)",
    "Cinnamon Lodge (2N) + PALM Hotel (2N) + Jetwing Blue (1N)",
    "Bed & Breakfast (BB)",
    1480,
    1700,
    750,
    200
  ],
  [
    "Option 1 (5★ Luxury)",
    "Cinnamon Lodge (2N) + PALM Hotel (2N) + Jetwing Blue (1N)",
    "Half Board (HB)",
    1730,
    1990,
    880,
    230
  ],
  [
    "Option 2 (4★ Premium)",
    "Habarana Village (2N) + PALM Hotel (2N) + Heritance Negombo (1N)",
    "Bed & Breakfast (BB)",
    1390,
    1600,
    710,
    180
  ],
  [
    "Option 2 (4★ Premium)",
    "Habarana Village (2N) + PALM Hotel (2N) + Heritance Negombo (1N)",
    "Half Board (HB)",
    1630,
    1875,
    830,
    215
  ],
  [],
  ["PACKAGE INCLUSIONS:"],
  ["• Accommodation for 5 Nights at mentioned luxury hotels (2N Habarana + 2N Ahangama + 1N Negombo)"],
  ["• 2 Nights in Ella: Transport, chauffeur allowance, and all sightseeing included (Client books Ella hotel)"],
  ["• Daily Breakfast (BB) or Breakfast & Dinner (HB) as per selected meal plan"],
  ["• 1 Child aged 4 years sharing parents' room (free accommodation on existing bedding + child meals)"],
  ["• Dedicated Private A/C Tourist Vehicle (Toyota Premio / Prius or Luxury Van with Child Safety Seat) for all 8 days"],
  ["• Professional English-speaking Tourist Chauffeur Guide throughout the 8-day tour"],
  ["• Chauffeur's accommodation, meals, highway express toll charges, parking, and all fuel allowances"],
  ["• Government tourist taxes, service charges (10%), and VAT (18%) included"],
  ["• 24/7 dedicated local tour coordinator and emergency support via WhatsApp (+94 71 177 0186)"],
  [],
  ["PACKAGE EXCLUSIONS:"],
  ["• International airfare & Sri Lanka Tourist Visa (ETA)"],
  ["• Hotel accommodation in Ella (13-15 Dec) - booked directly by client"],
  ["• Monuments / Entrance tickets (available as optional package below)"],
  ["• Lunches and personal expenses (laundry, telephone calls, beverages)"],
  ["• Chauffeur guide tips (recommended $10-$15/day for excellent service)"]
];

const wsSummary = XLSX.utils.aoa_to_sheet(summaryData);
wsSummary["!cols"] = [{ wch: 25 }, { wch: 45 }, { wch: 22 }, { wch: 20 }, { wch: 24 }, { wch: 20 }, { wch: 15 }];
XLSX.utils.book_append_sheet(wb, wsSummary, "Quotation Summary");

// ─── 2. DETAILED HOTEL RATES BREAKDOWN ───────────────────────────────────────
const hotelData = [
  ["DETAILED HOTEL PRICING & ROOM BREAKDOWN (DECEMBER 11 - 18, 2026)"],
  ["Dates", "Destination", "Hotel Option", "Star", "Room Category", "Nights", "BB Dbl/Night (USD)", "HB Dbl/Night (USD)", "Child Policy (4 yrs)", "Total BB (USD)", "Total HB (USD)"],
  [
    "11 - 13 Dec",
    "Habarana",
    "Cinnamon Lodge Habarana",
    "5★",
    "Superior Room (Double)",
    2,
    180,
    220,
    "Child 4 yrs: Free on existing bed; breakfast free, dinner $10",
    360,
    460
  ],
  [
    "11 - 13 Dec",
    "Habarana",
    "Habarana Village by Cinnamon",
    "4★",
    "Superior Cottage (Double)",
    2,
    140,
    175,
    "Child 4 yrs: Free on existing bed; breakfast free, dinner $8",
    280,
    366
  ],
  [
    "13 - 15 Dec",
    "Ella",
    "Client Booked Directly (No Hotel Required)",
    "-",
    "Booked by Client",
    2,
    0,
    0,
    "Handled directly by guest",
    0,
    0
  ],
  [
    "15 - 17 Dec",
    "Ahangama",
    "PALM Hotel Sri Lanka",
    "Boutique",
    "Deluxe Pavilion / Suite",
    2,
    175,
    220,
    "Child 4 yrs: Free on existing bed; breakfast free, dinner à la carte",
    350,
    460
  ],
  [
    "17 - 18 Dec",
    "Negombo",
    "Jetwing Blue Negombo",
    "5★",
    "Deluxe Room (Double)",
    1,
    170,
    210,
    "Child 4 yrs: Free on existing bed; meals free under 5 yrs",
    170,
    210
  ],
  [
    "17 - 18 Dec",
    "Negombo",
    "Sentido Heritance Negombo",
    "5★",
    "Deluxe Ocean View",
    1,
    180,
    225,
    "Child 4 yrs: Free on existing bed; breakfast free",
    180,
    225
  ],
  [],
  ["SUBTOTAL COMPARISONS (HOTEL ONLY):"],
  ["Option 1: Cinnamon Lodge + PALM Hotel + Jetwing Blue", "", "", "", "", 5, "", "", "", 880, 1130],
  ["Option 2: Habarana Village + PALM Hotel + Sentido Heritance", "", "", "", "", 5, "", "", "", 810, 1051]
];

const wsHotels = XLSX.utils.aoa_to_sheet(hotelData);
wsHotels["!cols"] = [
  { wch: 14 },
  { wch: 14 },
  { wch: 32 },
  { wch: 8 },
  { wch: 25 },
  { wch: 8 },
  { wch: 18 },
  { wch: 18 },
  { wch: 40 },
  { wch: 15 },
  { wch: 15 }
];
XLSX.utils.book_append_sheet(wb, wsHotels, "Hotel Breakdown");

// ─── 3. TRANSPORT & CHAUFFEUR GUIDE COSTING ─────────────────────────────────
const transportData = [
  ["PRIVATE TRANSPORT & CHAUFFEUR GUIDE (8 DAYS / 7 NIGHTS)"],
  ["Day", "Date", "Route & Sightseeing", "Approx KM", "Vehicle", "Daily Net Rate (USD)", "Includes"],
  ["Day 1", "11 Dec", "Airport (CMB) Pick-up → Pinnawala / Kurunegala → Habarana", 175, "Private A/C Vehicle", 70, "Fuel, Highway tolls, Driver allowance"],
  ["Day 2", "12 Dec", "Habarana → Sigiriya Rock Fortress → Dambulla Caves → Minneriya", 90, "Private A/C Vehicle", 70, "Sightseeing transfers, driver meals"],
  ["Day 3", "13 Dec", "Habarana → Matale Spice Garden → Kandy Temple → Ella", 210, "Private A/C Vehicle", 70, "Mountain scenic drive, parking"],
  ["Day 4", "14 Dec", "Ella Sightseeing: Nine Arch Bridge, Little Adam's Peak, Ravana Falls", 45, "Private A/C Vehicle", 70, "Local Ella touring, driver overnight"],
  ["Day 5", "15 Dec", "Ella → Udawalawe scenic road → Ahangama (Southern Coast)", 160, "Private A/C Vehicle", 70, "Coastal transfer, driver overnight"],
  ["Day 6", "16 Dec", "Ahangama → Galle Dutch Fort walking tour → Turtle Hatchery", 60, "Private A/C Vehicle", 70, "South coast touring, parking"],
  ["Day 7", "17 Dec", "Ahangama → Southern Express Highway → Negombo", 165, "Private A/C Vehicle", 70, "Expressway toll tickets, fuel"],
  ["Day 8", "18 Dec", "Negombo hotel → Colombo Airport (CMB) Drop-off for departure", 20, "Private A/C Vehicle", 70, "Airport drop-off, departure transfer"],
  [],
  ["TRANSPORT SUMMARY", "", "", "", "", "TOTAL TRANSPORT NET:", 560],
  ["• Includes Child Safety Seat for the 4-year-old child."],
  ["• Includes all fuel, parking fees, highway express tickets, driver's accommodation & meals."]
];

const wsTransport = XLSX.utils.aoa_to_sheet(transportData);
wsTransport["!cols"] = [{ wch: 8 }, { wch: 12 }, { wch: 45 }, { wch: 12 }, { wch: 22 }, { wch: 22 }, { wch: 35 }];
XLSX.utils.book_append_sheet(wb, wsTransport, "Transport Breakdown");

// ─── 4. OPTIONAL ENTRANCE FEES & ACTIVITIES MATRIX ──────────────────────────
const activitiesData = [
  ["OPTIONAL SIGHTSEEING ENTRANCE FEES (2 ADULTS + 1 CHILD 4 YRS)"],
  ["Sightseeing Attraction", "Category", "Adult Rate (USD)", "Child 4 yrs Rate (USD)", "Total 2A + 1C (USD)", "Notes"],
  ["Sigiriya Lion Rock Fortress", "UNESCO World Heritage", 36, 0, 72, "Child under 6 enters FREE"],
  ["Dambulla Royal Cave Temple", "UNESCO Heritage", 12, 0, 24, "Child under 6 enters FREE"],
  ["Temple of the Sacred Tooth Relic (Kandy)", "Cultural Site", 10, 0, 20, "Child enters free"],
  ["Minneriya / Kaudulla Elephant Safari", "Private 4x4 Jeep + Entry", 60, 10, 130, "Private Safari Jeep + Park permits"],
  ["Ella Nine Arch Bridge & Little Adam's Peak", "Nature / Views", 0, 0, 0, "Free public access"],
  ["Galle Dutch Fort Historic Walk", "Colonial Heritage", 0, 0, 0, "Free public access"],
  ["Kosgoda Sea Turtle Conservation Hatchery", "Wildlife Rescue", 10, 5, 25, "Educational conservation visit"],
  [],
  ["TOTAL ENTRANCE PACKAGE (OPTIONAL ADD-ON)", "", "", "", 271, "Can be added to client package upon request"]
];

const wsActivities = XLSX.utils.aoa_to_sheet(activitiesData);
wsActivities["!cols"] = [{ wch: 35 }, { wch: 25 }, { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 35 }];
XLSX.utils.book_append_sheet(wb, wsActivities, "Sightseeing & Activities");

// Write workbook
XLSX.writeFile(wb, filePath);
console.log(`✅ Master Costing Excel created successfully: ${filePath}`);
