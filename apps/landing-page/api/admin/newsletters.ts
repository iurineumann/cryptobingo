import { app } from '@azure/functions';
import { getAdminSessionByToken, getNewsletters } from '../_lib/models.js';
import { ok, unauthorized, serverError } from '../_lib/response.js';

app.http('adminNewsletters', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/newsletters',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const newsletters = await getNewsletters();
      return ok({ newsletters });
    } catch (e) {
      return serverError(e);
    }
  },
});
