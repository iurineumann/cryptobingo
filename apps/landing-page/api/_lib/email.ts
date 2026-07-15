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

async function sendMessage(to: string, subject: string, text: string, purpose: string): Promise<void> {
  const t = getTransporter();
  try {
    await t.sendMail({
      from: smtpSender,
      to,
      subject,
      text,
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

export async function sendNewsletter(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sendMessage(to, subject, body, 'newsletter');
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
