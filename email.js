import nodemailer from "nodemailer";
import { setTimeout as sleep } from "node:timers/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import dns from "node:dns/promises";

/**
 * Validate that recipient domain has valid, active MX records to prevent bounces
 */
export async function verifyDomainMX(email) {
  if (!email || !email.includes("@")) return { valid: false, reason: "Invalid format" };
  const domain = email.split("@")[1]?.trim()?.toLowerCase();
  if (!domain || !domain.includes(".")) return { valid: false, reason: "Invalid domain" };

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) => setTimeout(() => reject(new Error("DNS timeout")), 3000))
    ]);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      return { valid: true, domain, mx: mxRecords };
    }
    return { valid: false, reason: "No MX records found for domain " + domain };
  } catch (err) {
    return { valid: false, reason: `Domain DNS lookup failed (${err.code || err.message})` };
  }
}

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

  // Validate recipient domain MX records to prevent non-existent domain bounces
  const mxCheck = await verifyDomainMX(cleanEmail);
  if (!mxCheck.valid) {
    console.warn(`  🚫 Pre-send check: ${cleanEmail} rejected (${mxCheck.reason}). Skipping send to prevent bounce.`);
    return { success: false, reason: mxCheck.reason, skippedToPreventBounce: true };
  }

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

/**
 * Send a targeted B2B rate & availability inquiry for a specific client booking request (FIT / Family)
 */
export async function sendSpecificBookingInquiry({
  emails,
  hotelName,
  destination,
  checkIn,
  checkOut,
  nights,
  adults = 2,
  childAge = 4,
  roomType = "1 Double / Twin Room",
  optionsNote = "",
  clientAgency = "Rene Travel & Tourism (Jordan)"
}) {
  const clientConfig = getTransporter();
  if (!clientConfig) {
    return { success: false, reason: "SMTP credentials missing in .env" };
  }

  const emailList = (Array.isArray(emails) ? emails : [emails])
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e && e.includes("@"));

  if (emailList.length === 0) {
    return { success: false, reason: "No valid recipient emails provided" };
  }

  // Pre-validate deliverability with DNS MX check
  const validEmails = [];
  for (const em of emailList) {
    const check = await verifyDomainMX(em);
    if (check.valid) {
      validEmails.push(em);
    } else {
      console.warn(`  ⚠ Skipping unresolvable email: ${em} (${check.reason})`);
    }
  }

  if (validEmails.length === 0) {
    return { success: false, reason: "None of the provided recipient email domains have valid MX records" };
  }

  const primaryRecipient = validEmails[0];
  const ccRecipients = validEmails.slice(1);

  const agencyName = process.env.TRAVEL_AGENCY_NAME || "Oceanway Tours (Pvt) Ltd";
  const regNumber = process.env.COMPANY_REGISTRATION_NUMBER || "PV 00380121";
  const contactPhone = process.env.TRAVEL_AGENCY_PHONE || "+94 76 363 4022";
  const adminWhatsApp = "+94 71 177 0186";

  const subject = `Urgent B2B Rate & Availability Inquiry | ${hotelName} (${destination}) | ${checkIn} - ${checkOut} (2A + 1C)`;

  const textBody = `Dear Reservations & Contracting Team at ${hotelName},

Warm greetings from Oceanway Tours (Pvt) Ltd!

We have an active, high-priority inbound family itinerary request for Sri Lanka from our partner travel agency (${clientAgency}). We kindly request your best confidential Tour Operator / B2B contracted net rates and room availability for the following dates:

══════════════════════════════════════════════════════════════
INQUIRY SPECIFICATIONS:
══════════════════════════════════════════════════════════════
• Property / Location: ${hotelName} (${destination})
• Check-in Date: ${checkIn}
• Check-out Date: ${checkOut} (${nights} Night${nights > 1 ? "s" : ""})
• Guests: ${adults} Adults + 1 Child (Age: ${childAge} Years)
• Required Rooms: ${roomType}
${optionsNote ? `• Note / Preferences: ${optionsNote}\n` : ""}• Meal Plans Requested (please provide net rates for):
   - Bed & Breakfast (BB)
   - Half Board (HB)
   - Full Board (FB)

ADDITIONAL INQUIRY REQUIREMENTS:
1. Child Policy: Please specify policy/rate for 1 Child (${childAge} yrs) sharing parent's room (existing bedding vs extra bed).
2. Driver Arrangements: Please confirm driver accommodation and meal arrangements.
3. Cancellation & Cut-off: Please outline applicable cancellation policy and payment deadline.

COMPANY REGISTRATION & LEGAL CREDENTIALS:
Oceanway Tours (Pvt) Ltd is an officially incorporated Sri Lankan Tour Operator under Companies Act No. 7 of 2007 (Company Registration No: ${regNumber}).
For your vendor verification records, please find attached our official Certificate of Incorporation.

Kindly reply to this email at your earliest convenience with your best net rates and availability so we can confirm the booking for our client.

Thank you very much for your valued cooperation.

Warm regards,

Inbound Reservations & Contracting Desk
Oceanway Tours (Pvt) Ltd
Company Registration No: ${regNumber}
Hotline / Tel: ${contactPhone}
WhatsApp (Direct Contracting): ${adminWhatsApp}
Email: ${clientConfig.fromEmail}
Website: https://www.oceanwaytours.com
`;

  const htmlBody = `
<div style="font-family: Arial, sans-serif; color: #1e293b; max-width: 680px; margin: 0 auto; line-height: 1.6; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden;">
  <div style="background: linear-gradient(135deg, #0f172a, #1e3a8a); color: #ffffff; padding: 24px;">
    <div style="font-size: 20px; font-weight: bold; letter-spacing: 0.5px;">OCEANWAY TOURS (PVT) LTD</div>
    <div style="font-size: 12px; color: #94a3b8; margin-top: 4px;">Registered Tour Operator • Company Registration No: <b>${regNumber}</b></div>
    <div style="margin-top: 12px; font-size: 14px; color: #38bdf8; font-weight: 600;">URGENT B2B TOUR OPERATOR RATE & AVAILABILITY REQUEST</div>
  </div>

  <div style="padding: 24px;">
    <p>Dear Reservations & Contracting Team at <b>${hotelName}</b>,</p>

    <p>Warm greetings from <b>Oceanway Tours (Pvt) Ltd</b>!</p>

    <p>We have an active, high-priority inbound family itinerary request for Sri Lanka from our partner travel agency (${clientAgency}). We kindly request your best confidential Tour Operator / B2B contracted net rates and room availability for the following dates:</p>

    <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 18px; margin: 20px 0;">
      <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
        <tr>
          <td style="padding: 6px 0; color: #64748b; width: 35%;"><b>Property / Location:</b></td>
          <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${hotelName} (${destination})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Check-in Date:</b></td>
          <td style="padding: 6px 0; font-weight: bold; color: #166534;">${checkIn}</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Check-out Date:</b></td>
          <td style="padding: 6px 0; font-weight: bold; color: #991b1b;">${checkOut} (${nights} Night${nights > 1 ? "s" : ""})</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Number of Guests:</b></td>
          <td style="padding: 6px 0; font-weight: bold; color: #0f172a;">${adults} Adults + 1 Child (${childAge} Years)</td>
        </tr>
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Room Category:</b></td>
          <td style="padding: 6px 0; font-weight: bold; color: #1e40af;">${roomType}</td>
        </tr>
        ${optionsNote ? `<tr><td style="padding: 6px 0; color: #64748b;"><b>Special Notes:</b></td><td style="padding: 6px 0; color: #0f172a;">${optionsNote}</td></tr>` : ""}
        <tr>
          <td style="padding: 6px 0; color: #64748b;"><b>Meal Plans Requested:</b></td>
          <td style="padding: 6px 0; color: #0f172a;"><b>BB</b> (Bed & Breakfast), <b>HB</b> (Half Board), <b>FB</b> (Full Board)</td>
        </tr>
      </table>
    </div>

    <h4 style="color: #0f172a; margin-top: 20px; margin-bottom: 8px;">Kindly clarify:</h4>
    <ol style="font-size: 13px; color: #334155; padding-left: 20px;">
      <li><b>Child Supplement:</b> Policy & supplement for 1 child (${childAge} yrs) sharing parent room (existing bedding vs extra bed).</li>
      <li><b>Driver Arrangements:</b> Confirmation of driver accommodation and meals.</li>
      <li><b>Cancellation Policy:</b> Cancellation cut-off and payment terms for these dates.</li>
    </ol>

    <div style="background-color: #f1f5f9; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 20px 0; font-size: 12px; color: #475569;">
      <b>Company Registration & Verification:</b> Oceanway Tours (Pvt) Ltd is legally incorporated under the Companies Act No. 7 of 2007 (PV 00380121). For your official supplier registration, please see our Certificate of Incorporation attached.
    </div>

    <p>Please reply directly to this email with your best net rates so we can confirm the reservation today.</p>

    <p style="margin-top: 24px;">Warm regards,</p>
    <p style="margin: 0; font-weight: bold; color: #0f172a;">Inbound Reservations & Contracting Desk</p>
    <p style="margin: 2px 0 0 0; color: #2563eb; font-weight: 600;">Oceanway Tours (Pvt) Ltd</p>
    <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Company Registration No: ${regNumber} • Colombo, Sri Lanka</p>
    <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Hotline: ${contactPhone} • WhatsApp (Direct Contracting): ${adminWhatsApp}</p>
    <p style="margin: 2px 0 0 0; font-size: 12px; color: #64748b;">Email: ${clientConfig.fromEmail} • Web: <a href="https://www.oceanwaytours.com" style="color: #2563eb;">www.oceanwaytours.com</a></p>
  </div>
</div>
`;

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
    to: primaryRecipient,
    cc: ccRecipients.length > 0 ? ccRecipients : undefined,
    subject: subject,
    text: textBody,
    html: htmlBody,
    replyTo: clientConfig.fromEmail,
    attachments: attachments,
    headers: {
      "X-Inquiry-Type": "Specific-Client-Booking",
      "X-Hotel-Name": hotelName,
      "X-Destination": destination
    }
  };

  try {
    const info = await clientConfig.transporter.sendMail(mailOptions);
    console.log(`  📧 [Client Inquiry Sent] ${hotelName} (${destination}) → ${primaryRecipient}${ccRecipients.length ? ` (CC: ${ccRecipients.join(", ")})` : ""} [MsgID: ${info.messageId}]`);
    return {
      success: true,
      hotelName,
      primaryRecipient,
      ccRecipients,
      messageId: info.messageId
    };
  } catch (error) {
    console.error(`  ❌ Failed sending to ${hotelName} (${primaryRecipient}):`, error.message);
    return { success: false, hotelName, reason: error.message };
  }
}
