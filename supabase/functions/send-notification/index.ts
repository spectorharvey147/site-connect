import { createClient } from "npm:@supabase/supabase-js@2";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getTemplate, EmailTemplateType } from "./emailTemplates.ts";
import nodemailer from "npm:nodemailer@10.0.10";
import { Buffer } from "node:buffer";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const DEFAULT_FROM_NAME = 'Claim App Notifications';
const ALLOWED_METHODS = 'POST, OPTIONS';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TEMPLATE_TYPES: EmailTemplateType[] = [
  'welcome_user',
  'claim_submitted',
  'claim_submitted_user',
  'claim_submitted_manager',
  'claim_approved',
  'claim_accounts_verified',
  'claim_paid',
  'claim_rejected',
  'user_created',
  'password_reset',
];

function getAllowedOrigins() {
  return (Deno.env.get('ALLOWED_ORIGINS') || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function resolveCorsHeaders(req: Request) {
  const requestOrigin = req.headers.get('origin');
  const allowedOrigins = getAllowedOrigins();

  if (!requestOrigin) {
    return {
      'Access-Control-Allow-Origin': allowedOrigins[0] || '*',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-claims-token',
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      Vary: 'Origin',
    };
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) {
    return {
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-claims-token',
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      Vary: 'Origin',
    };
  }

  return null;
}

function jsonResponse(req: Request, status: number, payload: Record<string, unknown>) {
  const corsHeaders = resolveCorsHeaders(req);
  if (!corsHeaders) {
    return new Response(
      JSON.stringify({ success: false, error: 'Origin not allowed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  return new Response(
    JSON.stringify(payload),
    {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    },
  );
}

function isValidTemplateType(value: unknown): value is EmailTemplateType {
  return typeof value === 'string' && TEMPLATE_TYPES.includes(value as EmailTemplateType);
}

function isValidEmail(value: unknown): value is string {
  return typeof value === 'string' && EMAIL_REGEX.test(value.trim());
}

function formatAmount(value: unknown) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseAppDate(value: unknown) {
  if (!value) return new Date();
  const raw = String(value).trim();
  const hasExplicitZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw);
  const normalized = hasExplicitZone ? raw : raw.replace(' ', 'T') + 'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(raw) : date;
}
function formatClaimDate(value: unknown) {
  if (!value) return '-';
  const date = parseAppDate(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function pdfText(value: unknown) {
  return String(value ?? '-')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[^\x20-\x7E]/g, ' ') || '-';
}

function wrapPdfText(text: string, font: any, size: number, maxWidth: number) {
  const words = pdfText(text).split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= maxWidth) {
      current = next;
      continue;
    }
    if (current) lines.push(current);
    if (font.widthOfTextAtSize(word, size) <= maxWidth) {
      current = word;
    } else {
      let chunk = '';
      for (const char of word) {
        const nextChunk = chunk + char;
        if (font.widthOfTextAtSize(nextChunk, size) > maxWidth && chunk) {
          lines.push(chunk);
          chunk = char;
        } else {
          chunk = nextChunk;
        }
      }
      current = chunk;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : ['-'];
}

async function buildClaimReportPdf(data: any) {
  const claimNumber = data.claim_number || data.claim_id || 'claim';
  const companyName = data.companyName || 'Irrigation Products International Pvt Ltd';
  const companySubtitle = data.companySubtitle || 'Claims Management System';
  const pdfDoc = await PDFDocument.create();
  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const pageSize: [number, number] = [842, 595];
  const margin = 36;
  const tableWidths = [92, 108, 78, 198, 78, 86, 75];
  const headers = ['Category', 'Project Code', 'Date', 'Description', 'With Bill', 'Without Bill', 'Total'];
  let page = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;

  const drawText = (text: unknown, x: number, baseline: number, size = 9, font = regular, color = rgb(0.15, 0.18, 0.23)) => {
    page.drawText(pdfText(text), { x, y: baseline, size, font, color });
  };
  const addPage = () => {
    page = pdfDoc.addPage(pageSize);
    y = pageSize[1] - margin;
  };
  const ensureSpace = (height: number) => {
    if (y - height < margin) addPage();
  };

  page.drawRectangle({ x: 0, y: pageSize[1] - 96, width: pageSize[0], height: 96, color: rgb(0.03, 0.45, 0.42) });
  drawText(companySubtitle, margin, pageSize[1] - 28, 9, bold, rgb(0.83, 1, 0.97));
  drawText(companyName, margin, pageSize[1] - 50, 20, bold, rgb(1, 1, 1));
  drawText('Claim Report', margin, pageSize[1] - 73, 13, bold, rgb(0.9, 1, 0.98));
  drawText(`Claim Number: ${claimNumber}`, pageSize[0] - 286, pageSize[1] - 38, 12, bold, rgb(1, 1, 1));
  drawText(`Generated: ${formatClaimDate(data.generated_on || new Date().toISOString())}`, pageSize[0] - 286, pageSize[1] - 58, 9, regular, rgb(0.9, 1, 0.98));
  y = pageSize[1] - 122;

  const details = [
    ['Submitted By', data.submitted_by || data.employee_name || '-'],
    ['Employee Email', data.employee_email || '-'],
    ['Submission Date', formatClaimDate(data.submission_date || data.generated_on)],
    ['Project / Site', data.project_site || '-'],
    ['Work / Activity', data.work_name || '-'],
    ['Primary Project Code', data.primary_project_code || '-'],
    ['Status', data.status || data.admin_status || data.manager_status || '-'],
  ];
  const detailColWidth = (pageSize[0] - margin * 2 - 20) / 3;
  details.forEach(([label, value], index) => {
    const col = index % 3;
    const row = Math.floor(index / 3);
    const x = margin + col * (detailColWidth + 10);
    const boxY = y - row * 52;
    page.drawRectangle({ x, y: boxY - 34, width: detailColWidth, height: 42, borderColor: rgb(0.83, 0.87, 0.91), borderWidth: 1, color: rgb(0.97, 0.98, 0.99) });
    drawText(label, x + 8, boxY - 8, 7, bold, rgb(0.39, 0.45, 0.55));
    wrapPdfText(String(value), bold, 9, detailColWidth - 16).slice(0, 2).forEach((line, lineIndex) => {
      drawText(line, x + 8, boxY - 22 - lineIndex * 10, 9, bold, rgb(0.08, 0.1, 0.15));
    });
  });
  y -= Math.ceil(details.length / 3) * 52 + 8;

  const totalCards = [
    ['Total With Bill', `Rs. ${formatAmount(data.total_with_bill)}`],
    ['Total Without Bill', `Rs. ${formatAmount(data.total_without_bill)}`],
    ['Grand Total', `Rs. ${formatAmount(data.total_amount)}`],
  ];
  totalCards.forEach(([label, value], index) => {
    const x = margin + index * (detailColWidth + 10);
    page.drawRectangle({ x, y: y - 38, width: detailColWidth, height: 38, borderColor: rgb(0.13, 0.55, 0.49), borderWidth: 1, color: rgb(0.92, 0.98, 0.96) });
    drawText(label, x + 8, y - 14, 8, bold, rgb(0.13, 0.34, 0.32));
    drawText(value, x + 8, y - 29, 12, bold, rgb(0.02, 0.37, 0.34));
  });
  y -= 62;

  const drawTableHeader = () => {
    ensureSpace(34);
    drawText('Expense Details', margin, y, 12, bold, rgb(0.08, 0.1, 0.15));
    y -= 22;
    let x = margin;
    headers.forEach((header, index) => {
      page.drawRectangle({ x, y: y - 18, width: tableWidths[index], height: 22, borderColor: rgb(0.75, 0.8, 0.86), borderWidth: 1, color: rgb(0.9, 0.95, 1) });
      drawText(header, x + 5, y - 10, 8, bold, rgb(0.04, 0.21, 0.33));
      x += tableWidths[index];
    });
    y -= 18;
  };

  drawTableHeader();
  const items = Array.isArray(data.items) ? data.items : [];
  if (!items.length) {
    drawText('No expense line items were included in this email payload.', margin, y - 16, 9);
  }

  items.forEach((item: any) => {
    const cells = [
      item.category || '-',
      item.projectCode || '-',
      item.claimDate || '-',
      item.description || '-',
      `Rs. ${formatAmount(item.amountWithBill)}`,
      `Rs. ${formatAmount(item.amountWithoutBill)}`,
      `Rs. ${formatAmount(item.totalAmount ?? item.amount)}`,
    ];
    const wrapped = cells.map((cell, index) => wrapPdfText(String(cell), regular, 8, tableWidths[index] - 10));
    const rowHeight = Math.max(24, Math.max(...wrapped.map((lines) => lines.length)) * 10 + 12);
    if (y - rowHeight < margin) {
      addPage();
      drawTableHeader();
    }
    let x = margin;
    wrapped.forEach((lines, index) => {
      page.drawRectangle({ x, y: y - rowHeight, width: tableWidths[index], height: rowHeight, borderColor: rgb(0.83, 0.87, 0.91), borderWidth: 1, color: rgb(1, 1, 1) });
      lines.slice(0, Math.floor((rowHeight - 8) / 10)).forEach((line, lineIndex) => {
        const alignRight = index >= 4;
        const textWidth = regular.widthOfTextAtSize(line, 8);
        drawText(line, alignRight ? x + tableWidths[index] - textWidth - 5 : x + 5, y - 14 - lineIndex * 10, 8);
      });
      x += tableWidths[index];
    });
    y -= rowHeight;
  });

  ensureSpace(98);
  y -= 14;
  page.drawRectangle({ x: margin, y: y - 42, width: pageSize[0] - margin * 2, height: 42, borderColor: rgb(0.13, 0.55, 0.49), borderWidth: 1, color: rgb(0.94, 0.98, 0.96) });
  drawText(`Total With Bill: Rs. ${formatAmount(data.total_with_bill)}`, margin + 12, y - 16, 9, bold, rgb(0.02, 0.37, 0.34));
  drawText(`Total Without Bill: Rs. ${formatAmount(data.total_without_bill)}`, margin + 250, y - 16, 9, bold, rgb(0.02, 0.37, 0.34));
  drawText(`Grand Total: Rs. ${formatAmount(data.total_amount)}`, margin + 525, y - 16, 10, bold, rgb(0.02, 0.37, 0.34));
  drawText(`Submitted: Rs. ${formatAmount(data.submitted_amount ?? data.total_amount)}    Verified: Rs. ${formatAmount(data.verified_amount ?? data.total_amount)}`, margin + 12, y - 32, 8, regular, rgb(0.15, 0.18, 0.23));
  y -= 66;

  ensureSpace(52);
  const signWidth = (pageSize[0] - margin * 2 - 48) / 4;
  ['Submitted By', 'Admin Verification', 'Manager Approval', 'Final Approval'].forEach((label, index) => {
    const x = margin + index * (signWidth + 16);
    page.drawLine({ start: { x, y: y - 24 }, end: { x: x + signWidth, y: y - 24 }, thickness: 0.8, color: rgb(0.2, 0.24, 0.3) });
    drawText(label, x, y - 40, 8, bold, rgb(0.15, 0.18, 0.23));
  });

  const bytes = await pdfDoc.save();

  return {
    filename: `Claim-Report-${String(claimNumber).replace(/[^a-z0-9_-]+/gi, '-')}.pdf`,
    content: Buffer.from(bytes),
    contentType: 'application/pdf',
  };
}

Deno.serve(async (req) => {
  const corsHeaders = resolveCorsHeaders(req);

  if (!corsHeaders) {
    return new Response(
      JSON.stringify({ success: false, error: 'Origin not allowed' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return jsonResponse(req, 405, {
      success: false,
      error: 'Method not allowed. Use POST.',
    });
  }

  try {
    const gmailUser = Deno.env.get('GMAIL_USER');
    const gmailPassword = Deno.env.get('GMAIL_APP_PASSWORD')?.replace(/\s+/g, '');
    const emailFromName = (Deno.env.get('EMAIL_FROM_NAME') || DEFAULT_FROM_NAME).trim();

    if (!gmailUser || !gmailPassword) {
      console.error('Email function missing Gmail credentials');
      return jsonResponse(req, 500, {
        success: false,
        error: 'Gmail credentials not configured',
      });
    }

    let requestBody: any;
    try {
      requestBody = await req.json();
    } catch (parseError) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'Invalid JSON in request body',
        details: String(parseError),
      });
    }

    const recipientEmail = String(requestBody?.recipientEmail || '').trim().toLowerCase();
    const type = requestBody?.type;
    let data = (typeof requestBody?.data === 'object' && requestBody?.data !== null) ? requestBody.data : {};

    if (!isValidEmail(recipientEmail)) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'recipientEmail is required and must be a valid email address',
      });
    }

    if (!isValidTemplateType(type)) {
      return jsonResponse(req, 400, {
        success: false,
        error: 'Invalid email template type',
      });
    }

    const backend = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    if (type === 'password_reset') {
      // Only the backend creates and sees the single-use reset token.
      const { data: resetToken, error: resetError } = await backend.rpc('app_issue_password_reset', { p_email: recipientEmail });
      if (resetError) throw resetError;
      if (!resetToken) return jsonResponse(req, 200, { success: true, message: 'If registered, a reset link will be sent.' });
      const appUrl = (Deno.env.get('APP_URL') || 'https://site-connect-three.vercel.app').replace(/\/$/, '');
      data = { resetLink: appUrl + '/reset-password?email=' + encodeURIComponent(recipientEmail) + '&token=' + encodeURIComponent(resetToken), expiresIn: '1 hour' };
    } else {
      const { data: actor } = await backend.rpc('app_session', { p_token: req.headers.get('x-claims-token') || '' });
      if (!actor) return jsonResponse(req, 401, { success: false, error: 'Sign in to send notifications' });
      if (['user_created','welcome_user'].includes(type) && !['Admin','Super Admin'].includes(actor.role)) return jsonResponse(req, 403, { success: false, error: 'Administrator access required' });
      const { data: recipient } = await backend.from('users').select('email').eq('email', recipientEmail).eq('active', true).maybeSingle();
      if (!recipient) return jsonResponse(req, 400, { success: false, error: 'Recipient must be an active user' });
    }

    // Support explicit SMTP host/port via environment (useful for Gmail or relay)
    const smtpHost = Deno.env.get('SMTP_HOST') || 'smtp.gmail.com';
    const smtpPort = Number(Deno.env.get('SMTP_PORT') || 465);
    const smtpSecure = (Deno.env.get('SMTP_SECURE') || 'true') === 'true';

    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: gmailUser,
        pass: gmailPassword,
      },
    });

    const template = getTemplate(type, data);
    const attachments = String(type).startsWith('claim_submitted')
      ? [await buildClaimReportPdf(data)]
      : [];

    const mailResult = await transporter.sendMail({
      from: `"${emailFromName}" <${gmailUser}>`,
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
      attachments,
    });

    console.log(`Email sent: type=${type}, recipient=${recipientEmail}`);

    return jsonResponse(req, 200, {
      success: true,
      message: 'Email sent successfully',
      messageId: mailResult.messageId,
      recipient: recipientEmail,
    });
  } catch (error) {
    console.error('Unexpected error in send-notification:', error);
    return jsonResponse(req, 500, {
      success: false,
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    });
  }
});
