// k6 smoke test — 5 VUs, 30s, health check only
// Usage: k6 run tests/k6/smoke.js --env API_URL=http://localhost:8083
import http from 'k6/http';
import { check, sleep } from 'k6';

const API_URL = __ENV.API_URL || 'http://localhost:8083';

export const options = {
    vus:      5,
    duration: '30s',
    thresholds: {
        http_req_failed:   ['rate<0.01'],       // <1% de erros
        http_req_duration: ['p(95)<500'],        // p95 < 500ms
    },
};

export default function () {
    const res = http.get(`${API_URL}/api/v1/health`);
    check(res, {
        'status 200':          (r) => r.status === 200,
        'response time < 200ms': (r) => r.timings.duration < 200,
    });
    sleep(1);
}
