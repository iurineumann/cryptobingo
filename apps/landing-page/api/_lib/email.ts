import nodemailer from 'nodemailer';
import { query } from './db.js';

const smtpHost = process.env.SMTP_HOST ?? '';
const smtpPort = parseInt(process.env.SMTP_PORT ?? '587', 10);
const smtpSecure = process.env.SMTP_SECURE === 'true';
const smtpUser = process.env.SMTP_USER ?? '';
const smtpPass = process.env.SMTP_PASS ?? '';
const smtpSender = process.env.SMTP_SENDER ?? '';

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter(): ReturnType<typeof nodemailer.createTransport> {
  if (!transporter) {
    if (!smtpHost) throw new Error('SMTP_HOST not set');
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      ...(smtpUser ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    });
  }
  return transporter;
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendMessage(
  to: string,
  subject: string,
  text: string,
  purpose: string,
  from?: string,
  extraHeaders?: Record<string, string>,
): Promise<void> {
  const t = getTransporter();
  try {
    await t.sendMail({
      from: from ?? smtpSender,
      to,
      subject,
      text,
      ...(extraHeaders ? { headers: extraHeaders } : {}),
    });
    await logEmail(to, subject, purpose, 'sent');
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await logEmail(to, subject, purpose, 'failed', errMsg);
    throw e;
  }
}

export async function sendVoteCode(to: string, code: string, ideaTitle: string): Promise<void> {
  await sendMessage(
    to,
    'Your CryptoBingo verification code',
    [
      'Hello,',
      '',
      `Your verification code to vote on "${ideaTitle}" is:`,
      '',
      `  ${code}`,
      '',
      'This code expires in 15 minutes.',
      '',
      '— CryptoBingo Team',
    ].join('\n'),
    'vote_code',
  );
}

export async function sendAdminCode(to: string, code: string): Promise<void> {
  await sendMessage(
    to,
    'CryptoBingo admin login code',
    [
      'Hello,',
      '',
      'Your admin login code is:',
      '',
      `  ${code}`,
      '',
      'This code expires in 15 minutes.',
      '',
      '— CryptoBingo Team',
    ].join('\n'),
    'admin_code',
  );
}

export async function sendWelcome(to: string): Promise<void> {
  await sendMessage(
    to,
    'Welcome to CryptoBingo!',
    [
      'Thanks for subscribing!',
      '',
      "You'll be the first to know about CryptoBingo updates,",
      'new features, and launch announcements.',
      '',
      '— CryptoBingo Team',
    ].join('\n'),
    'welcome',
  );
}

const newsletterSender = process.env.NEWSLETTER_SENDER ?? 'newsletter@cryptobingo.bet';
const unsubscribeBase = process.env.UNSUBSCRIBE_BASE ?? 'https://landing-api.cryptobingo.bet/api/subscribe';

export async function sendNewsletter(
  to: string,
  subject: string,
  body: string,
  token?: string,
): Promise<void> {
  // Headers anti-spam (Gmail bulk sender requirements, RFC 8058):
  //  - List-Unsubscribe + One-Click Post (obrigatório p/ bulk desde 2024)
  //  - Precedence: bulk + Feedback-ID (sinais de "boa vizinhança")
  const headers: Record<string, string> = {
    'Precedence': 'bulk',
    'Feedback-ID': 'cryptobingo-newsletter:cryptobingo.bet',
  };
  if (token) {
    const url = `${unsubscribeBase}?token=${encodeURIComponent(token)}`;
    headers['List-Unsubscribe'] = `<${url}>`;
    headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  }

  // HTML com branding + preheader + link de descadastro visível.
  const html = renderNewsletterHtml(subject, body, token);
  const text = `${body}\n\n— CryptoBingo Team\n\nPara cancelar a inscrição: ${token ? `${unsubscribeBase}?token=${encodeURIComponent(token)}` : 'https://cryptobingo.bet'}`;

  const t = getTransporter();
  try {
    await t.sendMail({
      from: newsletterSender,
      to,
      subject,
      text,
      html,
      headers,
    });
    await logEmail(to, subject, 'newsletter', 'sent');
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : String(e);
    await logEmail(to, subject, 'newsletter', 'failed', errMsg);
    throw e;
  }
}

function renderNewsletterHtml(subject: string, body: string, token?: string): string {
  const unsubUrl = token
    ? `${unsubscribeBase}?token=${encodeURIComponent(token)}`
    : 'https://cryptobingo.bet';
  const paragraphs = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p>${escapeHtml(l)}</p>`)
    .join('\n');
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;background:#0b0e1a;color:#e8eaf2;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <h1 style="color:#7c5cff;font-size:22px;margin:0 0 16px;">CryptoBingo</h1>
    <h2 style="font-size:18px;margin:0 0 16px;">${escapeHtml(subject)}</h2>
    <div style="font-size:15px;line-height:1.6;">${paragraphs}</div>
    <hr style="border:none;border-top:1px solid #232744;margin:24px 0;">
    <p style="font-size:12px;color:#8a90b5;margin:0;">
      Você recebe este e-mail porque se inscreveu na newsletter da CryptoBingo.<br>
      <a href="${unsubUrl}" style="color:#7c5cff;">Cancelar inscrição</a>
    </p>
  </div>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function logEmail(
  to: string,
  subject: string,
  purpose: string,
  status: string = 'sent',
  errorMsg?: string | null,
): Promise<void> {
  await query(
    `INSERT INTO email_log (to_email, subject, purpose, status, error_msg) VALUES ($1, $2, $3, $4, $5)`,
    [to, subject, purpose, status, errorMsg ?? null],
  );
}
