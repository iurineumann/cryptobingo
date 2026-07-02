import { app, HttpRequest } from '@azure/functions';
import { consumeConfirmation, createAdminSession } from '../_lib/models.js';
import { ok, unauthorized, serverError } from '../_lib/response.js';

app.http('adminConfirm', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/confirm',
  handler: async (request) => {
    try {
      const body = (await request.json()) as {
        email?: string;
        code?: string;
      };

      if (!body.email || !body.code) {
        return unauthorized('Email and code are required');
      }

      const confirmation = await consumeConfirmation(
        body.email,
        body.code,
        'admin'
      );
      if (!confirmation) {
        return unauthorized('Invalid or expired code');
      }

      const session = await createAdminSession(body.email);
      return ok({
        message: 'Authenticated',
        token: session.token,
        expires_at: session.expires_at,
      });
    } catch (e) {
      return serverError(e);
    }
  },
});
