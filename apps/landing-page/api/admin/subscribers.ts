import { app } from '@azure/functions';
import { getAdminSessionByToken, getSubscribersPage } from '../_lib/models.js';
import { ok, unauthorized, serverError } from '../_lib/response.js';

app.http('adminSubscribers', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'admin/subscribers',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const limit = Number(request.query.get('limit')) || 20;
      const offset = Number(request.query.get('offset')) || 0;

      const result = await getSubscribersPage(limit, offset);
      return ok(result);
    } catch (e) {
      return serverError(e);
    }
  },
});
