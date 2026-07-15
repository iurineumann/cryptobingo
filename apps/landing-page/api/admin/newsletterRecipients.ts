import { app } from '@azure/functions';
import { getAdminSessionByToken, getNewsletterRecipients } from '../_lib/models.js';
import { ok, unauthorized, serverError } from '../_lib/response.js';

app.http('adminNewsletterRecipients', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/newsletters/{id}/recipients',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const id = Number(request.params.id);
      if (!Number.isFinite(id)) {
        return { status: 400, body: JSON.stringify({ error: 'Invalid id' }) };
      }

      const recipients = await getNewsletterRecipients(id);
      return ok({ recipients });
    } catch (e) {
      return serverError(e);
    }
  },
});
