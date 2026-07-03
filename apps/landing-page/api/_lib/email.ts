import { EmailClient } from '@azure/communication-email';
import type { EmailMessage } from '@azure/communication-email';

const conn = process.env.ACS_CONNECTION_STRING;
const sender = process.env.ACS_SENDER ?? '';
const adminEmail = process.env.ADMIN_EMAIL ?? '';

function getClient(): EmailClient {
  if (!conn) throw new Error('ACS_CONNECTION_STRING not set');
  return new EmailClient(conn);
}

export function generateCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendMessage(message: EmailMessage): Promise<void> {
  const client = getClient();
  const poller = await client.beginSend(message);
  await poller.pollUntilDone();
}

export async function sendVoteCode(to: string, code: string, ideaTitle: string): Promise<void> {
  await sendMessage({
    senderAddress: sender,
    content: {
      subject: 'Your CryptoBingo verification code',
      plainText: [
        `Hello,`,
        ``,
        `Your verification code to vote on "${ideaTitle}" is:`,
        ``,
        `  ${code}`,
        ``,
        `This code expires in 15 minutes.`,
        ``,
        `— CryptoBingo Team`,
      ].join('\n'),
    },
    recipients: { to: [{ address: to }] },
  });
}

export async function sendAdminCode(to: string, code: string): Promise<void> {
  await sendMessage({
    senderAddress: sender,
    content: {
      subject: 'CryptoBingo admin login code',
      plainText: [
        `Hello,`,
        ``,
        `Your admin login code is:`,
        ``,
        `  ${code}`,
        ``,
        `This code expires in 15 minutes.`,
        ``,
        `— CryptoBingo Team`,
      ].join('\n'),
    },
    recipients: { to: [{ address: to }] },
  });
}

export async function sendWelcome(to: string): Promise<void> {
  await sendMessage({
    senderAddress: sender,
    content: {
      subject: 'Welcome to CryptoBingo!',
      plainText: [
        `Thanks for subscribing!`,
        ``,
        `You'll be the first to know about CryptoBingo updates,`,
        `new features, and launch announcements.`,
        ``,
        `— CryptoBingo Team`,
      ].join('\n'),
    },
    recipients: { to: [{ address: to }] },
  });
}

export async function sendNewsletter(
  to: string,
  subject: string,
  body: string
): Promise<void> {
  await sendMessage({
    senderAddress: sender,
    content: { subject, plainText: body },
    recipients: { to: [{ address: to }] },
  });
}

export async function logEmail(to: string, subject: string, type: string): Promise<void> {
  const { query } = await import('./db.js');
  await query(`INSERT INTO email_log (recipient, subject, type) VALUES ($1, $2, $3)`, [to, subject, type]);
}
