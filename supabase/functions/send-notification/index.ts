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

    const mailResult = await transporter.sendMail({
      from: `"${emailFromName}" <${gmailUser}>`,
      to: recipientEmail,
      subject: template.subject,
      html: template.html,
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
