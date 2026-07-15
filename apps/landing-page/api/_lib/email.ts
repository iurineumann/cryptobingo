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

export async function sendNewsletter(
  to: string,
  subject: string,
  body: string,
  token?: string,
  preheader?: string,
): Promise<void> {
  const unsubUrl = token
    ? `${unsubscribeBase}?token=${encodeURIComponent(token)}`
    : `${unsubscribeBase}`;

  const headers: Record<string, string> = {
    'Precedence': 'bulk',
    'Feedback-ID': 'cryptobingo-newsletter:cryptobingo.bet',
    'List-Unsubscribe': `<${unsubUrl}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };

  const html = renderNewsletterHtml(subject, body, token, preheader);
  const text = `${body}\n\n— CryptoBingo Team\n\nPara cancelar a inscrição: ${unsubUrl}`;

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

const unsubscribeBase = process.env.UNSUBSCRIBE_BASE ?? 'https://landing-api.cryptobingo.bet/api/subscribe';

const NEWSLETTER_TEMPLATE = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{titulo}}</title>
</head>
<body style="margin:0;padding:0;background-color:#0b0e1a;font-family:Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="display:none;font-size:1px;color:#f1f5f9;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">
    {{preheader}}
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#0b0e1a;">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <!--[if mso]>
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:12px;"><tr><td style="padding:40px 32px 0;">
        <![endif]-->
        <div style="max-width:600px;width:100%;background-color:#1a1a2e;border-radius:12px;">
          <!--[if !mso]><!-->
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#1a1a2e;border-radius:12px;overflow:hidden;">
          <!--<![endif]-->
            <tr>
              <td style="padding:40px 32px 0;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-bottom:20px;border-bottom:2px solid #232744;">
                      <span style="color:#8b5cf6;font-size:22px;font-weight:700;letter-spacing:-0.03em;">CryptoBingo</span>
                      <span style="color:#64748b;font-size:13px;font-weight:400;margin-left:8px;">| BINGO GameFi na WAX</span>
                    </td>
                  </tr>
                </table>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding:32px 0 20px;">
                      <h1 style="margin:0;color:#f1f5f9;font-size:24px;font-weight:700;line-height:1.3;letter-spacing:-0.02em;">{{titulo}}</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 36px;color:#c8cbe0;font-size:15px;line-height:1.7;">
                      {{body}}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 36px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                  <tr>
                    <td style="padding-top:24px;border-top:1px solid #232744;text-align:center;">
                      <p style="margin:20px 0 0;color:#64748b;font-size:12px;line-height:1.5;">
                        Voc\u00ea recebeu este e-mail porque se inscreveu na newsletter da CryptoBingo.
                      </p>
                      <p style="margin:16px 0 0;">
                        <a href="{{unsubscribe_link}}" style="color:#8b5cf6;font-size:12px;text-decoration:underline;">Cancelar inscri\u00e7\u00e3o</a>
                      </p>
                      <p style="margin:20px 0 0;color:#475569;font-size:11px;">
                        &copy; {{ano}} CryptoBingo &middot; {{data}}
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          <!--[if !mso]><!-->
          </table>
          <!--<![endif]-->
          <!--[if mso]>
          </td></tr></table>
          <![endif]-->
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;

export function renderNewsletterHtml(
  subject: string,
  body: string,
  token?: string,
  preheader?: string,
): string {
  const unsubUrl = token
    ? `${unsubscribeBase}?token=${encodeURIComponent(token)}`
    : `${unsubscribeBase}`;
  const paragraphs = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<p style="margin:0 0 12px;">${escapeHtml(l)}</p>`)
    .join('\n');
  const year = String(new Date().getFullYear());
  const date = new Date().toLocaleDateString('pt-BR');

  return NEWSLETTER_TEMPLATE
    .replace('{{titulo}}', escapeHtml(subject))
    .replace('{{body}}', paragraphs)
    .replace('{{preheader}}', escapeHtml(preheader ?? ''))
    .replace('{{unsubscribe_link}}', unsubUrl)
    .replace('{{ano}}', year)
    .replace('{{data}}', date);
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
