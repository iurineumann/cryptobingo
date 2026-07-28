import { Request, Response } from 'express';

const GA4_MEASUREMENT_ID = 'G-BLQRZ64RES';
const GA4_API_SECRET = process.env.GA4_API_SECRET ?? '';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

function consentGranted(req: Request): boolean {
  // Consent gate (LGPD/GDPR): só repassa se analytics foi concedido.
  // Fronte: grava cookie cb_consent=1 quando o usuário aceita analytics.
  const cookie = req.headers.cookie ?? '';
  if (/cb_consent=1/.test(cookie)) return true;
  const xConsent = req.headers['x-consent'];
  if (xConsent === 'granted' || xConsent === '1') return true;
  return false;
}

function resolveClientId(req: Request, params: Record<string, unknown>): string {
  // client_id real (1ª parte) vindo do frontend, ou header, ou fallback anônimo.
  const p = params?.client_id;
  if (typeof p === 'string' && p.length > 0) return p;
  const h = req.headers['x-client-id'];
  if (typeof h === 'string') return h;
  return 'cryptobingo-anon';
}

export async function analyticsEventHandler(req: Request, res: Response): Promise<void> {
  const { event, ...params } = req.body ?? {};

  if (!event || typeof event !== 'string') {
    res.status(400).json({ error: 'Campo "event" (string) é obrigatório.' });
    return;
  }

  // Consent gate: negado → 204 silencioso (não envia MP, não quebra app)
  if (!consentGranted(req)) {
    res.status(204).end();
    return;
  }

  const clientId = resolveClientId(req, params as Record<string, unknown>);

  try {
    await fetch(GA4_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        events: [{ name: event, params }],
      }),
    });
  } catch {
    // best-effort — falha de analytics nunca quebra o app
  }

  res.status(204).end();
}
