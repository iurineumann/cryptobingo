import { app, HttpRequest } from '@azure/functions';
import { createConfirmation } from '../_lib/models.js';
import { sendAdminCode, generateCode } from '../_lib/email.js';
import { ok, unauthorized, serverError } from '../_lib/response.js';

const adminEmail = process.env.ADMIN_EMAIL ?? '';

app.http('adminLogin', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'admin/login',
  handler: async (request) => {
    try {
      const body = (await request.json()) as { email?: string };
      if (body.email !== adminEmail) {
        return unauthorized('Invalid email');
      }

      const code = generateCode();
      await createConfirmation({
        email: body.email,
        code,
        purpose: 'admin',
      });

      await sendAdminCode(body.email, code).catch((e) => {
        console.error('[email] sendAdminCode failed:', e);
      });

      return ok({ message: 'Code sent', code_expires_at: '15 minutes' });
    } catch (e) {
      return serverError(e);
    }
  },
});
