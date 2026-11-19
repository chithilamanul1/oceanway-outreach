import express from 'express';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { harvestHotelsForCategory, loadHotelsDb, saveHotelsDb } from './index.js';
import { syncRateSheetsFromInbox, saveRateSheetAttachment } from './inbox_harvester.js';
import { sendRateSheetInquiry } from './email.js';
import { initWhatsApp, getWhatsAppStatus, requestWhatsAppPairingCode } from './whatsapp.js';
import { loadMasterCostingSheet, analyzeRateSheetDocument } from './rate_sheet_analyzer.js';
import {
  runContinuousHarvester,
  startContinuousHarvester,
  stopContinuousHarvester,
  isContinuousHarvesterRunning,
  EXPANDED_SRI_LANKA_REGIONS
} from './islandwide_continuous_worker.js';
import { dispatchAllClientInquiries, loadInquiriesLog, CLIENT_HOTEL_INQUIRIES } from './send_client_hotel_inquiries.js';
import { setTimeout as sleep } from 'node:timers/promises';

// Auto-load .env if running standalone outside Docker/Vercel
if (existsSync('.env') && !process.env.VERCEL) {
  try {
    process.loadEnvFile('.env');
  } catch {}
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));
// Also serve rate_sheets directory statically so files can be opened directly
app.use('/rate_sheets', express.static(join(__dirname, 'rate_sheets')));

// Ensure rate_sheets directory structure exists
const BASE_RATE_SHEET_DIR = join(__dirname, 'rate_sheets');
['3_star', '4_star', '5_star'].forEach((dir) => {
  const p = join(BASE_RATE_SHEET_DIR, dir);
  if (!existsSync(p)) mkdirSync(p, { recursive: true });
});

// ─── API: GET HOTELS ────────────────────────────────────────────────────────────

app.get('/api/hotels', async (req, res) => {
  try {
    const category = req.query.category;
    let hotels = loadHotelsDb();

    if (category && category !== 'all') {
      hotels = hotels.filter((h) => h.star_category === category);
    }

    res.json(hotels);
  } catch (err) {
    console.error('Error fetching hotels:', err);
    res.status(500).json({ error: 'Failed to fetch hotels' });
  }
});

// ─── API: TRIGGER CATEGORY SCAN ───────────────────────────────────────────────

let isScanning = false;
let scanStatus = { running: false, category: null, region: null, log: '' };

app.get('/api/worker/state', (req, res) => {
  try {
    let data = {
      isRunning: isContinuousHarvesterRunning(),
      cycleCount: 0,
      totalInquiriesSent: 0,
      totalHotelsDiscovered: 0,
      currentRegionIndex: 0,
      currentRegionName: 'Sigiriya',
      totalRegions: EXPANDED_SRI_LANKA_REGIONS.length,
      pacingPerHour: 100,
      pacingIntervalSec: 36
    };

    if (existsSync('worker_state.json')) {
      const saved = JSON.parse(readFileSync('worker_state.json', 'utf8'));
      data = {
        ...data,
        ...saved,
        isRunning: isContinuousHarvesterRunning()
      };
      if (typeof data.currentRegionIndex === 'number' && EXPANDED_SRI_LANKA_REGIONS[data.currentRegionIndex]) {
        data.currentRegionName = EXPANDED_SRI_LANKA_REGIONS[data.currentRegionIndex];
      }
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/worker/start', (req, res) => {
  try {
    const started = startContinuousHarvester();
    res.json({
      success: true,
      running: true,
      message: started ? 'Autonomous 100/hr continuous rate hunter started.' : 'Continuous worker is already running.'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/worker/stop', (req, res) => {
  try {
    stopContinuousHarvester();
    res.json({
      success: true,
      running: false,
      message: 'Autonomous rate hunter stopping cleanly...'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/scan/status', (req, res) => {
  res.json(scanStatus);
});

app.post('/api/scan', async (req, res) => {
  if (isScanning) {
    return res.status(400).json({ error: 'A scan is already in progress.' });
  }

  const { category = '4-star', region = null, sendEmails = false } = req.body;

  isScanning = true;
  scanStatus = { running: true, category, region, log: `Started scan for ${category}...` };

  res.json({ success: true, message: `Scan initiated for ${category}` });

  // Run asynchronously
  (async () => {
    try {
      await harvestHotelsForCategory(category, region, { sendEmails });
      scanStatus = { running: false, category, region, log: `Scan finished for ${category}!` };
    } catch (err) {
      scanStatus = { running: false, category, region, log: `Scan error: ${err.message}` };
    } finally {
      isScanning = false;
    }
  })();
});

// ─── API: SYNC INBOX FOR RATE SHEETS ───────────────────────────────────────────

app.post('/api/sync-inbox', async (req, res) => {
  try {
    const result = await syncRateSheetsFromInbox();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── API: MASTER COSTING BIG SHEET DATA ───────────────────────────────────────

app.get('/api/costing-sheet', (req, res) => {
  try {
    const { destination, category } = req.query;
    let rows = loadMasterCostingSheet();

    if (destination && destination !== 'all') {
      rows = rows.filter((r) => (r.destination || '').toLowerCase() === destination.toLowerCase());
    }

    if (category && category !== 'all') {
      rows = rows.filter((r) => (r.starCategory || '').toLowerCase().includes(category.toLowerCase()));
    }

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load costing sheet' });
  }
});

// Download Excel file directly (Dynamic Master)
app.get('/api/costing-sheet/download', (req, res) => {
  const filePath = resolve(__dirname, 'rate_sheets', 'Master_SriLanka_Hotel_Costing_Sheet.xlsx');
  if (existsSync(filePath)) {
    res.download(filePath, 'Master_SriLanka_Hotel_Costing_Sheet.xlsx');
  } else {
    res.status(404).json({ error: 'Excel file not generated yet. Analyze at least one rate sheet first.' });
  }
});

// Download 17-Pax International Master Costing Sheet (7D, 10D, 12D Itineraries)
app.get('/api/costing-sheet/17pax/download', (req, res) => {
  const filePath = resolve(__dirname, 'costing_sheets', 'Oceanway_17Pax_International_Itineraries_Costing.xlsx');
  if (existsSync(filePath)) {
    res.download(filePath, 'Oceanway_17Pax_International_Itineraries_Costing.xlsx');
  } else {
    res.status(404).json({ error: '17-Pax Costing workbook not found.' });
  }
});

// Download Rene Travel 2A+1C Itinerary Costing Workbook (Habarana, Ahangama, Negombo)
app.get('/api/costing-sheet/rene-travel/download', (req, res) => {
  const filePath = resolve(__dirname, 'costing_sheets', 'Rene_Travel_2A1C_SriLanka_Costing.xlsx');
  if (existsSync(filePath)) {
    res.download(filePath, 'Rene_Travel_2A1C_SriLanka_Costing.xlsx');
  } else {
    res.status(404).json({ error: 'Rene Travel costing workbook not found.' });
  }
});

// Download Oceanway Tours Business Registration Certificate (PV 00380121)
app.get('/api/business-registration/download', (req, res) => {
  const filePath = resolve(__dirname, 'assets', 'Oceanway_Tours_Business_Registration_PV00380121.pdf');
  if (existsSync(filePath)) {
    res.download(filePath, 'Oceanway_Tours_Business_Registration_PV00380121.pdf');
  } else {
    res.status(404).json({ error: 'Business Registration certificate not found.' });
  }
});

// ─── API: CLIENT ITINERARY SPECIFIC HOTEL INQUIRIES ─────────────────────────
app.get('/api/inquiries/client-hotels/status', (req, res) => {
  try {
    const logs = loadInquiriesLog();
    res.json({ inquiries: CLIENT_HOTEL_INQUIRIES, logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/inquiries/client-hotels/dispatch', async (req, res) => {
  try {
    res.json({ success: true, message: 'Client hotel inquiries dispatch initiated in background.' });
    dispatchAllClientInquiries().catch(console.error);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Trigger AI analysis on a specific hotel's rate sheets
app.post('/api/analyze-rate-sheet/:id', async (req, res) => {
  const { id } = req.params;
  const hotels = loadHotelsDb();
  const hotel = hotels.find((h) => h.place_id === id);

  if (!hotel) return res.status(404).json({ error: 'Hotel not found' });
  if (!hotel.rate_sheets || hotel.rate_sheets.length === 0) {
    return res.status(400).json({ error: 'No rate sheet files available for this hotel yet.' });
  }

  try {
    const results = [];
    for (const filePath of hotel.rate_sheets) {
      const fullPath = resolve(__dirname, filePath);
      const resAnalysis = await analyzeRateSheetDocument(fullPath, {
        hotelName: hotel.name,
        destination: hotel.region || 'Sri Lanka',
        starCategory: hotel.star_category,
        placeId: hotel.place_id
      });
      results.push(resAnalysis);
    }
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: CONNECT WHATSAPP FOR RATE SHEET DELIVERY ────────────────────────────

app.get('/api/whatsapp/status', (req, res) => {
  res.json(getWhatsAppStatus());
});

app.post('/api/whatsapp/pairing-code', async (req, res) => {
  try {
    const phone = req.body?.phone || process.env.ADMIN_WHATSAPP_NUMBER || "94711770186";
    const pairingCode = await requestWhatsAppPairingCode(phone);
    res.json({ success: true, phone, pairingCode });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/whatsapp/connect', async (req, res) => {
  try {
    initWhatsApp();
    res.json({ success: true, message: 'WhatsApp client initializing. Check terminal if QR scan is needed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── API: SEND INQUIRY TO SINGLE HOTEL ─────────────────────────────────────────

app.post('/api/send-inquiry/:id', async (req, res) => {
  const { id } = req.params;
  const hotels = loadHotelsDb();
  const hotel = hotels.find((h) => h.place_id === id);

  if (!hotel) {
    return res.status(404).json({ error: 'Hotel not found' });
  }

  if (!hotel.email) {
    return res.status(400).json({ error: 'No email address registered for this hotel' });
  }

  const result = await sendRateSheetInquiry(hotel.email, {
    name: hotel.name,
    starCategory: hotel.star_category,
    place_id: hotel.place_id
  });

  if (result.success) {
    hotel.status = 'EMAIL_SENT';
    hotel.email_sent_at = new Date().toISOString();
    saveHotelsDb(hotels);
    res.json({ success: true, hotel });
  } else {
    res.status(500).json({ error: result.reason || 'Failed to send email' });
  }
});

// ─── API: BATCH SEND INQUIRIES ─────────────────────────────────────────────────

app.post('/api/send-batch', async (req, res) => {
  const { category } = req.body;
  const hotels = loadHotelsDb();
  const queue = hotels.filter((hotel) => {
    if (category && category !== 'all' && hotel.star_category !== category) return false;
    if (hotel.status === 'EMAIL_SENT' || hotel.status === 'RATE_SHEET_RECEIVED') return false;
    return Boolean(hotel.email);
  });

  if (queue.length === 0) {
    return res.json({ success: true, sentCount: 0, message: 'No uncontacted hotels found for this category.' });
  }

  // Acknowledge immediately to avoid HTTP timeouts
  res.json({
    success: true,
    sentCount: queue.length,
    message: `Batch send started for ${queue.length} hotels with 20s anti-spam pacing.`
  });

  // Background dispatch with safe Hostinger spacing
  (async () => {
    console.log(`\n📨 Starting batch dispatch for ${queue.length} hotels (20s spacing)...`);
    for (const hotel of queue) {
      const currentHotels = loadHotelsDb();
      const target = currentHotels.find((h) => h.place_id === hotel.place_id);
      if (!target || target.status === 'EMAIL_SENT' || target.status === 'RATE_SHEET_RECEIVED') continue;

      const result = await sendRateSheetInquiry(target.email, {
        name: target.name,
        starCategory: target.star_category,
        place_id: target.place_id
      });

      if (result.success) {
        target.status = 'EMAIL_SENT';
        target.email_sent_at = new Date().toISOString();
        saveHotelsDb(currentHotels);
      }

      console.log(`   ⏳ Hostinger safe pacing: waiting 20s before next email...`);
      await sleep(20000);
    }
    console.log(`✅ Batch dispatch complete.\n`);
  })().catch((err) => console.error('Batch send background error:', err));
});

// ─── API: OPEN RATE SHEETS FOLDER IN WINDOWS EXPLORER ─────────────────────────

app.get('/api/open-folder', (req, res) => {
  const folderPath = resolve(__dirname, 'rate_sheets');
  if (process.platform === 'win32') {
    exec(`explorer.exe "${folderPath}"`, (err) => {
      if (err) {
        return res.status(500).json({ error: 'Failed to open folder' });
      }
      res.json({ success: true, path: folderPath });
    });
  } else {
    res.json({ success: true, path: folderPath, note: 'Folder location on VPS' });
  }
});

// ─── PERIODIC BACKGROUND INBOX MONITOR (EVERY 2 MINUTES) ──────────────────────
if (!process.env.VERCEL) {
  const AUTO_SYNC_INTERVAL_MS = 2 * 60 * 1000;
  setInterval(async () => {
    const user = process.env.IMAP_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
    if (user) {
      console.log('⏰ Auto-polling inbox for newly replied rate sheets...');
      await syncRateSheetsFromInbox().catch(() => {});
    }
  }, AUTO_SYNC_INTERVAL_MS);

  // ─── START SERVER & BACKGROUND SERVICES ───────────────────────────────────────
  app.listen(PORT, () => {
    console.log(`\n================================================================`);
    console.log(`🏨 Travel Agency Hotel Rate Sheet Manager running at http://localhost:${PORT}`);
    console.log(`================================================================\n`);

    // Pre-initialize WhatsApp client so incoming rate sheets forward immediately
    const adminPhone = process.env.ADMIN_WHATSAPP_NUMBER;
    if (adminPhone) {
      console.log(`📱 Pre-connecting WhatsApp for automatic delivery to ${adminPhone}...`);
      initWhatsApp().catch((err) => console.warn(`⚠ WhatsApp pre-init warning: ${err.message}`));
    }

    // Initial startup inbox scan after 5 seconds
    setTimeout(async () => {
      const user = process.env.IMAP_USER || process.env.SMTP_USER || process.env.EMAIL_USER;
      if (user) {
        console.log('📬 Initial startup inbox check for newly arrived rate sheets...');
        await syncRateSheetsFromInbox().catch(() => {});
      }
    }, 5000);

    // Autonomous Continuous Island-Wide Rate Hunter (Target: ~100 hotels/hour non-stop)
    setTimeout(() => {
      console.log('\n🚀 Starting Continuous Autonomous Island-Wide Rate Hunter (100 hotels/hr target)...');
      runContinuousHarvester().catch((err) => console.error('Continuous worker error:', err));
    }, 10000);
  });
}

export default app;
