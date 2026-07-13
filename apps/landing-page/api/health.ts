import { app } from '@azure/functions';

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: async () => {
    return {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      jsonBody: { status: 'ok' },
    };
  },
});
