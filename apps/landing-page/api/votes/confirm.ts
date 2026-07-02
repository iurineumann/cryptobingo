import { app, HttpRequest } from '@azure/functions';
import { consumeConfirmation, upsertVote } from '../_lib/models.js';
import { ok, badRequest, unauthorized, serverError } from '../_lib/response.js';

app.http('voteConfirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'votes/confirm',
  handler: async (request) => {
    try {
      const body = (await request.json()) as {
        email?: string;
        code?: string;
      };

      if (!body.email || !body.code) {
        return badRequest('Email and code are required');
      }

      const confirmation = await consumeConfirmation(
        body.email,
        body.code,
        'vote'
      );
      if (!confirmation) {
        return unauthorized('Invalid or expired code');
      }

      const meta = confirmation.metadata as {
        idea_id: number;
        vote_type: 'upvote' | 'downvote';
      } | null;
      if (!meta) {
        return badRequest('Confirmation metadata missing');
      }

      await upsertVote(meta.idea_id, body.email, meta.vote_type);
      return ok({ message: 'Vote confirmed!' });
    } catch (e) {
      return serverError(e);
    }
  },
});
