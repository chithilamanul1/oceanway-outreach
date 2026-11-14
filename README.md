# Oceanway Tours - Autonomous Island-Wide Hotel Rate Hunter & Master Costing Engine

[![Dokploy Ready](https://img.shields.io/badge/Dokploy-Ready-blue.svg)](https://dokploy.com)
[![Vercel Compatible](https://img.shields.io/badge/Vercel-Compatible-black.svg)](https://vercel.com)
[![Node 20+](https://img.shields.io/badge/Node-20%2B-green.svg)](https://nodejs.org)
[![Company Reg](https://img.shields.io/badge/Company%20Reg-PV%2000380121-amber.svg)](assets/Oceanway_Tours_Business_Registration_PV00380121.pdf)

Autonomous 24/7 B2B hotel rate sheet procurement, AI document extraction, and master tour itinerary costing system built specifically for **Oceanway Tours (Pvt) Ltd** (Company Reg: **PV 00380121**).

Operates entirely through a modern web dashboard with continuous background workers, Hostinger SMTP/IMAP integration, WhatsApp bot rate delivery, and exportable master costing workbooks.

---

## 🌟 Key Capabilities

1. **Continuous 24/7 Island-Wide Rate Hunter (~100 Hotels / Hour)**
   - Sweeps 65+ curated tourist destinations across all 9 provinces of Sri Lanka.
   - Dispatches formal B2B rate inquiry emails directly from `b2b@oceanwaytours.com`.
   - **Auto-attaches official Certificate of Incorporation (`PV 00380121`)** as proof of registered Sri Lankan travel agency credentials.
   - Safe anti-spam pacing: exactly 36-second intervals (~100 emails/hour) staying comfortably within Hostinger's sending quotas.
   - Focuses strictly on 4-star and 3-star inventory, capping 5-star luxury at 1-2 properties per town.

2. **Automated IMAP Rate Sheet Ingestion & AI Pricing Extraction**
   - Polls inbox every 2 minutes for hotel email replies with PDF or Excel attachments.
   - Extracts season dates, room types (Deluxe, Superior, Suite), and meal plan contracted rates (RO, BB, HB, FB).
   - Ingests pricing rows dynamically into the **Master Costing Big Sheet**.

3. **WhatsApp Bot Delivery (QR & 8-Digit Pairing Code)**
   - Connects to WhatsApp using either QR code scanning or 8-digit phone pairing code (`0760602638`).
   - Automatically forwards all received rate sheet files (PDFs/spreadsheets) directly to admin WhatsApp **`+94 71 177 0186`**.

4. **Master Costing Sheets & Itinerary Packages**
   - **17-Pax International Group Costing Master Workbook** (`.xlsx`):
     - Comprehensive costing across 7-Day Classic, 10-Day Heritage, and 12-Day Island Explorer itineraries.
     - 33-seater luxury coach transport costing, licensed National Tour Guide Lecturer, entrance fee matrix, and net/selling prices with 15% markups.
   - **Master Sri Lanka Hotel Costing Big Sheet** (`.xlsx`): Exportable table of all parsed contracted rates.

5. **Full Web Operation via Dashboard**
   - Real-time worker controls: Start, pause, or resume the 100/hr continuous harvester.
   - Real-time island sweep metrics: Active destination, cycle number, inquiries dispatched, and coverage progress.
   - WhatsApp status and pairing code generator modal.
   - One-click downloads for Excel workbooks and Business Registration PDF.

---

## 🚀 Deployment Guide

### Option 1: Dokploy Panel (Recommended for 24/7 Continuous Operation)

[Dokploy](https://dokploy.com) is a free, self-hosted Docker management platform. Because this application runs persistent background daemons, IMAP polling, and Chromium for WhatsApp Web, Dokploy is the ideal platform.

#### Step 1: Create Application in Dokploy
1. Log into your Dokploy dashboard.
2. Navigate to **Applications** → click **Create Application**.
3. Choose **GitHub** as the source provider and select:
   - Repository: `chithilamanul1/oceanway-outreach`
   - Branch: `main`
4. Under **Build Type**, select **Dockerfile**.

#### Step 2: Configure Persistent Volumes (Mounts)
To ensure your WhatsApp session and downloaded rate sheets persist across container restarts or redeployments, add the following mounts in the **Mounts / Volumes** tab:

| Type | Host / Volume Name | Container Path | Description |
| :--- | :--- | :--- | :--- |
| **Volume** | `oceanway_wa_auth` | `/app/.wwebjs_auth` | Persists WhatsApp login session |
| **Volume** | `oceanway_rate_sheets` | `/app/rate_sheets` | Stores incoming hotel rate sheets |
| **Volume** | `oceanway_costing` | `/app/costing_sheets` | Stores master costing workbooks |
| **File** | `./hotels_db.json` | `/app/hotels_db.json` | Persistent hotel database |
| **File** | `./seen_hotels.json` | `/app/seen_hotels.json` | Prevents duplicate inquiries |
| **File** | `./worker_state.json` | `/app/worker_state.json` | Preserves sweep progress |

#### Step 3: Set Environment Variables
In Dokploy's **Environment** tab, copy and paste the values from `.env.example`:

```env
PORT=3000
NODE_ENV=production

# AI Engine
OPENROUTER_API_KEY=your_openrouter_api_key

# Hostinger SMTP & IMAP
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=b2b@oceanwaytours.com
SMTP_PASS=your_email_password
EMAIL_FROM="Oceanway Tours (Pvt) Ltd" <b2b@oceanwaytours.com>

IMAP_HOST=imap.hostinger.com
IMAP_PORT=993
IMAP_SECURE=true
IMAP_USER=b2b@oceanwaytours.com
IMAP_PASS=your_email_password

# WhatsApp Automation
ADMIN_WHATSAPP_NUMBER=94711770186
WHATSAPP_SENDER_NUMBER=94760602638
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium
PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
```

#### Step 4: Expose Port & Deploy
1. In the **General** settings tab, set **Port** to `3000`.
2. Add your custom domain or enable Dokploy's free Traefik SSL subdomain (e.g. `outreach.yourdomain.com`).
3. Click **Deploy**. Dokploy will pull the repo, build the Docker container with Chromium, and start the 24/7 worker.

---

### Option 2: Vercel (Free Serverless Web Dashboard Preview)

Vercel provides free instant cloud hosting for the web dashboard interface.

> **Note on Vercel:** Vercel functions are stateless and serverless (with execution limits). The web UI, Big Sheet browser, and costing downloads run seamlessly on Vercel. For continuous 24/7 background email dispatch and persistent WhatsApp socket connections, run the worker on Dokploy or your local PC.

#### Step-by-Step Vercel Deployment:
1. Go to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. Click **Add New** → **Project**.
3. Import the repository **`chithilamanul1/oceanway-outreach`**.
4. In the **Environment Variables** section, add:
   - `OPENROUTER_API_KEY`
   - `SMTP_USER` / `SMTP_PASS`
   - `ADMIN_WHATSAPP_NUMBER`
5. Click **Deploy**.
6. Your live dashboard will be accessible at `https://oceanway-outreach.vercel.app`.

---

### Option 3: Local / Windows PC (Starts Automatically on Boot)

If you prefer running the worker on your local office PC:

1. Clone and install dependencies:
   ```bash
   git clone https://github.com/chithilamanul1/oceanway-outreach.git
   cd oceanway-outreach
   npm install
   ```
2. Configure `.env` with your credentials:
   ```bash
   cp .env.example .env
   ```
3. Start the system:
   - Double click `start_bot.bat` (or run `npm run dashboard`).
4. **Auto-Start on Windows Boot**:
   - The installer places a shortcut in `%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Oceanway_Hotel_Rate_Hunter.vbs`.
   - The harvester and dashboard will automatically boot in the background whenever your PC starts.

---

## 📁 Repository Structure

```
├── Dockerfile                  # Production Debian Bullseye image with Chromium & fonts
├── docker-compose.yml          # Compose file with persistent volumes for Dokploy
├── vercel.json                 # Vercel serverless function configuration
├── dashboard.js                # Express dashboard server with REST APIs & worker supervisor
├── islandwide_continuous_worker.js # Autonomous 100/hr continuous harvester across 65+ towns
├── inbox_harvester.js          # Hostinger IMAP poller for rate sheet attachments
├── rate_sheet_analyzer.js      # AI parser extracting room rates into Master Costing Sheet
├── email.js                    # Hostinger SMTP client attaching Business Registration PDF
├── whatsapp.js                 # WhatsApp Web bot forwarding rate sheets to +94 71 177 0186
├── email_scraper.js            # Scrapes reservations emails from official hotel websites
├── public/
│   ├── index.html              # Modern responsive Tailwind dashboard & worker control panel
│   └── whatsapp_qr.html        # Clean browser QR pairing screen
├── assets/
│   └── Oceanway_Tours_Business_Registration_PV00380121.pdf # Official Certificate of Incorporation
├── costing_sheets/
│   └── Oceanway_17Pax_International_Itineraries_Costing.xlsx # 17-pax international tour costing
├── rate_sheets/                # Auto-categorized downloaded rate sheets (3★, 4★, 5★)
├── hotels_db.json              # Verified Sri Lanka hotel database
├── master_costing_sheet.json   # Parsed room rates & season price lines
├── worker_state.json           # Real-time state of the 100/hr continuous harvester
└── seen_hotels.json            # Deduplication index
```

---

## 🔒 Security & Privacy

- **No Secrets in Git**: All sensitive credentials (passwords, API tokens, WhatsApp session auth) are strictly excluded via `.gitignore`.
- **Anti-Spam Pacing**: Inquiries are spaced at 36 seconds (~100/hour) to comply with professional B2B email guidelines and Hostinger burst thresholds.
- **Legal Compliance**: Every inquiry states Oceanway Tours (Pvt) Ltd's legal incorporation status and attaches certificate `PV 00380121`.

---

© 2026 **Oceanway Tours (Pvt) Ltd** • Colombo, Sri Lanka • Reg No: PV 00380121
