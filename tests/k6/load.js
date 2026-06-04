// k6 load test — spec de carga completo
// Usage: k6 run tests/k6/load.js --env API_URL=http://localhost:8083 --env JWT=<token>
import http  from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

const API_URL = __ENV.API_URL || 'http://localhost:8083';
const JWT     = __ENV.JWT     || '';

const rateLimitHits = new Counter('rate_limit_429');
const authErrors    = new Counter('auth_errors_401');
const dosAttempts   = new Counter('dos_batch_attempts');

export const options = {
    scenarios: {
        // Carga regular de jogadores
        player_load: {
            executor:        'ramping-vus',
            startVUs:        0,
            stages: [
                { duration: '1m', target: 50 },
                { duration: '3m', target: 50 },
                { duration: '1m', target: 0 },
            ],
            gracefulRampDown: '30s',
        },
        // Teste de burst no endpoint de auth (deve ativar rate limiting)
        auth_burst: {
            executor:  'constant-arrival-rate',
            rate:      30,              // 30 req/s (acima do limite de 20/min por IP)
            timeUnit:  '1s',
            duration:  '30s',
            preAllocatedVUs: 10,
            startTime: '30s',
        },
        // Teste de DoS via batch sem limite
        dos_batch: {
            executor:  'per-vu-iterations',
            vus:       2,
            iterations: 5,
            startTime: '1m',
        },
    },
    thresholds: {
        http_req_failed:   ['rate<0.01'],
        http_req_duration: ['p(95)<500'],
        // Rate limiting deve ativar em burst de auth
        rate_limit_429:    ['count>0'],
    },
};

const authHeaders = { Authorization: `Bearer ${JWT}` };

export default function (data) {
    const scenario = __ENV.K6_SCENARIO_NAME || 'player_load';

    if (scenario === 'player_load') {
        // GET salas públicas
        const rooms = http.get(`${API_URL}/api/v1/rooms`);
        check(rooms, { 'rooms 200': (r) => r.status === 200 });

        // GET estatísticas públicas
        const stats = http.get(`${API_URL}/api/v1/statistics/games/batch?gameIds=1,2,3`);
        check(stats, { 'stats 200': (r) => r.status === 200 });

        sleep(1);
    }

    if (scenario === 'auth_burst') {
        // Burst de challenge → deve ativar 429 após limite
        const res = http.post(`${API_URL}/api/v1/auth/challenge`,
            JSON.stringify({ wallet: 'testplayer1' }),
            { headers: { 'Content-Type': 'application/json' } });

        if (res.status === 429) rateLimitHits.add(1);
        if (res.status === 401) authErrors.add(1);
        check(res, { 'auth challenge responded': (r) => [200, 429].includes(r.status) });
    }

    if (scenario === 'dos_batch') {
        // Tentativa de DoS com 10.000 gameIds
        const ids = Array.from({ length: 10000 }, (_, i) => i + 1).join(',');
        const res  = http.get(`${API_URL}/api/v1/statistics/games/batch?gameIds=${ids}`);
        dosAttempts.add(1);
        // Deve responder em < 200ms mesmo com 10.000 IDs (slice(0,200) ativo)
        check(res, {
            'dos batch responded':    (r) => r.status === 200,
            'dos response fast':      (r) => r.timings.duration < 500,
        });
    }
}
