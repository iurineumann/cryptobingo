import { app } from '@azure/functions';
import { getAdminSessionByToken, getNewsletterById, getPendingRecipients, recordNewsletterSend, updateNewsletterSentCount } from '../_lib/models.js';
import { sendNewsletter } from '../_lib/email.js';
import { ok, badRequest, unauthorized, serverError } from '../_lib/response.js';

app.http('adminNewsletterSendPending', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/newsletters/{id}/send-pending',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const newsletterId = Number(request.params.id);
      if (!Number.isFinite(newsletterId)) {
        return badRequest('Invalid id');
      }

      const newsletter = await getNewsletterById(newsletterId);
      if (!newsletter) {
        return badRequest('Newsletter not found');
      }

      const pending = await getPendingRecipients(newsletterId);
      const sent: string[] = [];
      const failed: string[] = [];

      for (const sub of pending) {
        try {
          await sendNewsletter(sub.email, newsletter.subject, newsletter.body, sub.token ?? undefined);
          await recordNewsletterSend(newsletterId, sub.email, sub.token, 'sent');
          sent.push(sub.email);
        } catch (e) {
          console.error(`[newsletter] send-pending failed for ${sub.email}:`, e);
          await recordNewsletterSend(newsletterId, sub.email, sub.token, 'failed');
          failed.push(sub.email);
        }
      }

      await updateNewsletterSentCount(newsletterId, newsletter.sent_count + sent.length);

      return ok({ sent: sent.length, failed: failed.length });
    } catch (e) {
      return serverError(e);
    }
  },
});
