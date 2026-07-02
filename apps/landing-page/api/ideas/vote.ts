import { app, HttpRequest } from '@azure/functions';
import { getIdeaById, createConfirmation } from '../_lib/models.js';
import { sendVoteCode } from '../_lib/email.js';
import { generateCode } from '../_lib/email.js';
import { ok, badRequest, serverError } from '../_lib/response.js';

app.http('ideaVote', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'ideas/vote',
  handler: async (request) => {
    try {
      const body = (await request.json()) as {
        idea_id?: number;
        email?: string;
        vote_type?: string;
      };

      if (!body.idea_id || !body.email || !body.vote_type) {
        return badRequest('idea_id, email, and vote_type are required');
      }
      if (!['upvote', 'downvote'].includes(body.vote_type)) {
        return badRequest('vote_type must be upvote or downvote');
      }

      const idea = await getIdeaById(body.idea_id);
      if (!idea) return badRequest('Idea not found');

      const code = generateCode();
      await createConfirmation({
        email: body.email,
        code,
        purpose: 'vote',
        metadata: { idea_id: body.idea_id, vote_type: body.vote_type },
      });

      await sendVoteCode(body.email, code, idea.title).catch((e) => {
        console.error('[email] sendVoteCode failed:', e);
      });

      return ok({ message: 'Code sent', code_expires_at: '15 minutes' });
    } catch (e) {
      return serverError(e);
    }
  },
});
