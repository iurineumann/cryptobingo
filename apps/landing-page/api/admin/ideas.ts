import { app, HttpRequest } from '@azure/functions';
import { getAdminSessionByToken, updateIdeaStatus } from '../_lib/models.js';
import { ok, badRequest, unauthorized, notFound, serverError } from '../_lib/response.js';

const validStatuses = ['pending', 'approved', 'rejected', 'implemented'];

app.http('adminIdeaStatus', {
  methods: ['PUT'],
  authLevel: 'anonymous',
  route: 'admin/ideas/{ideaId}/status',
  handler: async (request) => {
    try {
      const auth = request.headers.get('authorization') ?? '';
      const token = auth.replace('Bearer ', '');
      if (!token) return unauthorized('Missing auth token');

      const session = await getAdminSessionByToken(token);
      if (!session) return unauthorized('Invalid or expired session');

      const ideaId = parseInt(request.params.ideaId ?? '');
      if (isNaN(ideaId)) return badRequest('Invalid idea ID');

      const body = (await request.json()) as { status?: string };
      if (!body.status || !validStatuses.includes(body.status)) {
        return badRequest(
          `Status must be one of: ${validStatuses.join(', ')}`
        );
      }

      const idea = await updateIdeaStatus(ideaId, body.status);
      if (!idea) return notFound('Idea not found');

      return ok(idea);
    } catch (e) {
      return serverError(e);
    }
  },
});
