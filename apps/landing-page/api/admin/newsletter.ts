import { app, HttpRequest } from '@azure/functions';
import { getAdminSessionByToken, getActiveSubscribers } from '../_lib/models.js';
import { sendNewsletter, logEmail } from '../_lib/email.js';
import { ok, badRequest, unauthorized, serverError } from '../_lib/response.js';

app.http('adminNewsletter', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/newsletter',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const body = (await request.json()) as {
        subject?: string;
        body?: string;
      };
      if (!body.subject?.trim() || !body.body?.trim()) {
        return badRequest('Subject and body are required');
      }

      const subscribers = await getActiveSubscribers();
      const sent: string[] = [];
      const failed: string[] = [];

      for (const sub of subscribers) {
        try {
          await sendNewsletter(sub.email, body.subject, body.body);
          await logEmail(sub.email, body.subject, 'newsletter');
          sent.push(sub.email);
        } catch (e) {
          console.error(`[newsletter] failed for ${sub.email}:`, e);
          failed.push(sub.email);
        }
      }

      return ok({ sent: sent.length, failed: failed.length });
    } catch (e) {
      return serverError(e);
    }
  },
});
