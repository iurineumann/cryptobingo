import { app } from '@azure/functions';
import { getStats } from './_lib/models.js';
import { ok, serverError } from './_lib/response.js';

app.http('stats', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'stats',
  handler: async () => {
    try {
      const stats = await getStats();
      return ok(stats);
    } catch (e) {
      return serverError(e);
    }
  },
});
