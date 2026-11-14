import nodemailer from "nodemailer";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Configure SMTP transporter
 * Supports custom hosting mailboxes (cPanel, Webmail, Titan, Hostinger) and Gmail
 */
function getTransporter() {
  const smtpUser = process.env.SMTP_USER || process.env.EMAIL_USER;
  const smtpPass = process.env.SMTP_PASS || process.env.EMAIL_PASS;
  const smtpHost = process.env.SMTP_HOST || "smtp.hostinger.com";
  const smtpPort = parseInt(process.env.SMTP_PORT || "465", 10);
  const smtpSecure = process.env.SMTP_SECURE === "false" ? false : (smtpPort === 465);

  // 1. Hostinger / Custom Hosting SMTP
  if (smtpUser && smtpPass) {
    return {
      transporter: nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpSecure,
        auth: {
          user: smtpUser,
          pass: smtpPass,
        },
        pool: false, // Ensure fresh connection
        tls: {
          rejectUnauthorized: false
        }
      }),
      fromEmail: smtpUser
    };
  }

  // 2. Gmail Fallback
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return {
      transporter: nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
      }),
      fromEmail: process.env.GMAIL_USER
    };
  }

  return null;
}

/**
 * Generate a professional B2B Travel Agency Rate Sheet Inquiry
 */
export function generateRateInquiryText(hotelName, starCategory = "Hotel") {
  const agencyName = process.env.TRAVEL_AGENCY_NAME || "Oceanway Tours (Pvt) Ltd";
  const regNumber = process.env.COMPANY_REGISTRATION_NUMBER || "PV 00380121";
  const contactName = process.env.TRAVEL_AGENCY_CONTACT || "Inbound Reservations & Contracting Desk";
  const contactPhone = process.env.TRAVEL_AGENCY_PHONE || "+94 76 363 4022";
  const adminWhatsApp = "+94 71 177 0186";
  const agencyEmail = process.env.SMTP_USER || process.env.EMAIL_USER || "b2b@oceanwaytours.com";

  return `Dear Contracting & Reservations Team at ${hotelName},

Greetings from ${agencyName}!

We are currently updating our preferred hotel supplier portfolio and contracting B2B confidential rates for our upcoming inbound tourist seasons (2026/2027). Our company handles leisure FIT travelers, private family groups, and custom bespoke itineraries across Sri Lanka.

Company Registration & Legal Status:
Oceanway Tours (Pvt) Ltd is a legally incorporated Private Limited Company under the Companies Act No. 7 of 2007 (Company Registration No: ${regNumber}). For your contracting and supplier verification records, please find attached our official Certificate of Incorporation issued by the Department of the Registrar of Companies Sri Lanka.

As part of our itinerary costing and partner package compilation, we would appreciate it if you could kindly share your Confidential Travel Agent / Tour Operator Contracted Rate Sheet (Tariff Sheet) for ${hotelName}.

Please kindly provide:
1. FIT & Group Contracted Tour Operator Rates for 2026 / 2027 seasons.
2. Room categories, descriptions, and seasonal validity dates.
3. Meal supplements (BB, HB, FB) and child policies.
4. Driver accommodation and meal arrangements.
5. Standard cancellation terms and booking conditions.

Please reply to this email with your latest contracted rate sheet attached (PDF, Excel, or Word format) so we can incorporate ${hotelName} into our immediate client itineraries.

Thank you very much for your kind support, and we look forward to a successful business partnership.

Warm regards,

${contactName}
${agencyName}
Company Registration No: ${regNumber}
Tel / WhatsApp (Hotline): ${contactPhone}
WhatsApp (Direct Contracting): ${adminWhatsApp}
Email: ${agencyEmail}
Website: https://www.oceanwaytours.com
`;
}

/**
 * Send a formal rate sheet inquiry email to a hotel with automatic Hostinger rate limit backoff
 */
export async function sendRateSheetInquiry(emailAddress, hotelDetails) {
  const clientConfig = getTransporter();

  if (!clientConfig) {
    console.warn("  ⚠ Email skip: SMTP credentials (SMTP_USER/SMTP_PASS) not configured in .env");
    return { success: false, reason: "SMTP credentials missing in .env" };
  }

  if (!emailAddress || !emailAddress.includes("@")) {
    return { success: false, reason: "Invalid email address format" };
  }

  const cleanEmail = emailAddress.trim().toLowerCase();

  const agencyName = process.env.TRAVEL_AGENCY_NAME || "Oceanway Tours (Pvt) Ltd";
  const subject = `Confidential Rate Sheet Request 2026/2027 | ${hotelDetails.name} - ${agencyName}`;
  const textBody = generateRateInquiryText(hotelDetails.name, hotelDetails.starCategory);

  // Attach official Certificate of Incorporation / Business Registration PDF
  const brPath = resolve("assets", "Oceanway_Tours_Business_Registration_PV00380121.pdf");
  const attachments = [];
  if (existsSync(brPath)) {
    attachments.push({
      filename: "Oceanway_Tours_Certificate_of_Incorporation_PV00380121.pdf",
      path: brPath,
      contentType: "application/pdf"
    });
  }

  const mailOptions = {
    from: `"${agencyName}" <${clientConfig.fromEmail}>`,
    to: cleanEmail,
    subject: subject,
    text: textBody,
    replyTo: clientConfig.fromEmail,
    attachments: attachments,
    headers: {
      "X-Hotel-Place-ID": hotelDetails.place_id || "",
      "X-Hotel-Category": hotelDetails.starCategory || ""
    }
  };

  let maxAttempts = 3;
  let attempt = 0;

  while (attempt < maxAttempts) {
    attempt++;
    try {
      const info = await clientConfig.transporter.sendMail(mailOptions);
      console.log(`  📧 Rate sheet inquiry successfully sent to ${hotelDetails.name} (${cleanEmail}) from ${clientConfig.fromEmail}`);
      return { success: true, messageId: info.messageId };
    } catch (error) {
      const errMsg = error.message || "";

      // Hostinger rate limit: 451 4.7.1 Ratelimit exceeded
      if (errMsg.includes("451") || errMsg.toLowerCase().includes("ratelimit")) {
        console.warn(`  ⏳ [Hostinger Rate Limit Hit] Hostinger burst protection activated.`);
        if (attempt < maxAttempts) {
          const waitSeconds = 60 * attempt;
          console.log(`     Waiting ${waitSeconds}s for rate limit to reset before retrying ${hotelDetails.name}...`);
          await sleep(waitSeconds * 1000);
          console.log(`     🔄 Retrying send to ${hotelDetails.name}...`);
          continue;
        } else {
          console.warn(`  ⚠ Rate limit cooldown still active after ${maxAttempts} attempts. Moving to next lead.`);
          return { success: false, reason: "Hostinger sending rate limit reached. Backing off." };
        }
      }

      console.warn(`  ⚠ Email delivery failed for ${cleanEmail}: ${errMsg}`);
      return { success: false, reason: errMsg };
    }
  }

  return { success: false, reason: "Max retry attempts exceeded" };
}
