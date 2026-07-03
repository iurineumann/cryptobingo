import { Request, Response } from 'express';

const GA4_MEASUREMENT_ID = 'G-BLQRZ64RES';
const GA4_API_SECRET = process.env.GA4_API_SECRET ?? '';
const GA4_ENDPOINT = `https://www.google-analytics.com/mp/collect?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`;

export async function analyticsEventHandler(req: Request, res: Response): Promise<void> {
  const { event, ...params } = req.body ?? {};

  if (!event || typeof event !== 'string') {
    res.status(400).json({ error: 'Campo "event" (string) é obrigatório.' });
    return;
  }

  const clientId = params.client_id ?? 'cryptobingo-proxy';

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
