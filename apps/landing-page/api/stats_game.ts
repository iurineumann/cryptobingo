import { app } from '@azure/functions';
import { ok, serverError } from './_lib/response.js';

const GATEWAY_URL = process.env.GATEWAY_URL || 'https://test-api.cryptobingo.bet';

app.http('stats_game', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'stats/game',
  handler: async () => {
    try {
      const res = await fetch(
        `${GATEWAY_URL}/api/v1/statistics/summary`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) },
      );
      if (!res.ok) throw new Error(`gateway ${res.status}`);

      const summary = await res.json() as {
        totals: { total_games: number; total_players: number };
        by_token: Array<{
          token: string;
          total_games: number;
          total_prizes: number;
          avg_rtp_pct: number;
          total_players: number;
        }>;
        generated_at: string;
      };

      return ok(summary);
    } catch (e) {
      return serverError(e);
    }
  },
});
