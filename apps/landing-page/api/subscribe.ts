import { app, HttpRequest } from '@azure/functions';
import { subscribe, unsubscribe } from './_lib/models.js';
import { sendWelcome } from './_lib/email.js';
import { ok, badRequest, serverError } from './_lib/response.js';

app.http('subscribe', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'subscribe',
  handler: async (request) => {
    try {
      if (request.method === 'GET') {
        const token = request.query.get('token');
        if (!token) return badRequest('Missing token');
        await unsubscribe(token);
        return ok({ message: 'Unsubscribed successfully' });
      }

      const body = (await request.json()) as { email?: string };
      if (!body.email) return badRequest('Email is required');

      const sub = await subscribe(body.email);
      await sendWelcome(body.email).catch((e) => {
        console.error('[email] sendWelcome failed:', e);
      });

      return ok({ message: 'Subscribed!', token: sub.token });
    } catch (e) {
      const err = e as { constraint?: string; code?: string };
      if (err.constraint?.includes('email') || err.code === '23505') {
        return badRequest('Already subscribed');
      }
      return serverError(e);
    }
  },
});
