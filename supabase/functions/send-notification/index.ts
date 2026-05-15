import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { getTemplate, EmailTemplateType } from "./emailTemplates.ts";
import nodemailer from "npm:nodemailer";

const DEFAULT_FROM_NAME = 'Claim App Notifications';
const ALLOWED_METHODS = 'POST, OPTIONS';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/i;
const TEMPLATE_TYPES: EmailTemplateType[] = [
  'welcome_user',
  'claim_submitted',
  'claim_submitted_user',
  'claim_submitted_manager',
  'claim_approved',
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
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': ALLOWED_METHODS,
      Vary: 'Origin',
    };
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(requestOrigin)) {
    return {
      'Access-Control-Allow-Origin': requestOrigin,
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

function escapePdfText(value: unknown) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[\r\n]+/g, ' ');
}

function truncate(value: unknown, max = 74) {
  const text = String(value ?? '');
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatAmount(value: unknown) {
  return Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildClaimReportPdf(data: any) {
  const claimNumber = data.claim_number || data.claim_id || 'claim';
  const lines = [
    'Claim Report',
    `Claim Number: ${claimNumber}`,
    `Submitted By: ${data.submitted_by || data.employee_name || ''}`,
    `Employee Email: ${data.employee_email || ''}`,
    `Submission Date: ${data.submission_date || data.generated_on || ''}`,
    `Project / Site: ${data.project_site || ''}`,
    `Primary Project Code: ${data.primary_project_code || ''}`,
    `Status: ${data.status || data.admin_status || data.manager_status || ''}`,
    `Total With Bill: Rs. ${formatAmount(data.total_with_bill)}`,
    `Total Without Bill: Rs. ${formatAmount(data.total_without_bill)}`,
    `Total Amount: Rs. ${formatAmount(data.total_amount)}`,
    '',
    'Expense Details',
    'Category | Project Code | Date | Description | With Bill | Without Bill | Total',
    ...((Array.isArray(data.items) ? data.items : []).map((item: any) => [
      truncate(item.category, 16),
      truncate(item.projectCode, 18),
      truncate(item.claimDate, 12),
      truncate(item.description, 28),
      formatAmount(item.amountWithBill),
      formatAmount(item.amountWithoutBill),
      formatAmount(item.totalAmount ?? item.amount),
    ].join(' | '))),
  ];

  const contentLines = lines.flatMap((line) => {
    const text = String(line || '');
    const chunks = text.match(/.{1,110}/g);
    return chunks || [''];
  });
  const stream = [
    'BT',
    '/F1 10 Tf',
    '50 790 Td',
    '14 TL',
    ...contentLines.slice(0, 52).map((line, index) => `${index === 0 ? '' : 'T*'}(${escapePdfText(line)}) Tj`),
    'ET',
  ].join('\n');

  const encoder = new TextEncoder();
  const streamLength = encoder.encode(stream).length;
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${streamLength} >>\nstream\n${stream}\nendstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (const object of objects) {
    offsets.push(encoder.encode(pdf).length);
    pdf += object;
  }
  const xrefOffset = encoder.encode(pdf).length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return {
    filename: `Claim-Report-${String(claimNumber).replace(/[^a-z0-9_-]+/gi, '-')}.pdf`,
    content: encoder.encode(pdf),
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
    const data = (typeof requestBody?.data === 'object' && requestBody?.data !== null) ? requestBody.data : {};

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
      ? [buildClaimReportPdf(data)]
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
