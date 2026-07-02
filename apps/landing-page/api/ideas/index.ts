import { app, HttpRequest } from '@azure/functions';
import { getIdeas, createIdea } from '../_lib/models.js';
import { ok, created, badRequest, serverError } from '../_lib/response.js';

app.http('ideas', {
  methods: ['GET', 'POST'],
  authLevel: 'anonymous',
  route: 'ideas',
  handler: async (request) => {
    try {
      if (request.method === 'GET') {
        const sort = request.query.get('sort') ?? 'newest';
        const ideas = await getIdeas(sort);
        return ok(ideas);
      }

      const body = (await request.json()) as {
        title?: string;
        description?: string;
        author_name?: string;
        author_email?: string;
      };

      if (!body.title?.trim() || !body.description?.trim()) {
        return badRequest('Title and description are required');
      }
      if (!body.author_name?.trim() || !body.author_email?.trim()) {
        return badRequest('Author name and email are required');
      }

      const idea = await createIdea({
        title: body.title.trim(),
        description: body.description.trim(),
        author_name: body.author_name.trim(),
        author_email: body.author_email.trim(),
      });
      return created(idea);
    } catch (e) {
      return serverError(e);
    }
  },
});
