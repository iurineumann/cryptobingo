// apps/api-gateway/src/services/metrics.ts
// Servidor de métricas Prometheus para o API Gateway.
//
// Expõe /metrics na porta METRICS_PORT (padrão: 9092) — servidor HTTP isolado,
// fora do Express principal, sem auth/CORS/rate-limit.
// O Prometheus faz scrape desta porta conforme prometheus.yml.
//
// Métricas expostas:
//   - http_requests_total             (counter, por method/route/status)
//   - http_request_duration_ms        (histogram, por method/route)
//   - http_requests_in_flight         (gauge)
//   - Node.js default metrics         (heap, GC, event loop lag)
//
// Ref: ADR-007 (observabilidade)

import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from 'prom-client';
import type { Request, Response, NextFunction } from 'express';

const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT ?? '9092', 10);

export const registry = new Registry();

collectDefaultMetrics({ register: registry, prefix: 'api_' });

export const httpRequestsTotal = new Counter({
    name:       'api_http_requests_total',
    help:       'Total de requisições HTTP processadas pelo API Gateway.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers:  [registry],
});

export const httpRequestDuration = new Histogram({
    name:       'api_http_request_duration_ms',
    help:       'Duração das requisições HTTP em milissegundos.',
    labelNames: ['method', 'route'] as const,
    buckets:    [10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers:  [registry],
});

export const httpRequestsInFlight = new Gauge({
    name:      'api_http_requests_in_flight',
    help:      'Número de requisições HTTP em processamento no momento.',
    registers: [registry],
});

// ==========================================
// MIDDLEWARE EXPRESS
// Injeta no registerMiddleware() do index.ts.
// req.route.path normaliza /rooms/123 → /rooms/:roomId automaticamente.
// ==========================================

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
    const start = Date.now();
    httpRequestsInFlight.inc();

    res.on('finish', () => {
        // req.route só existe após o roteamento — rotas 404 ficam como 'unknown'
        const route = req.route?.path ?? 'unknown';
        const labels = { method: req.method, route };

        httpRequestsTotal.inc({ ...labels, status_code: String(res.statusCode) });
        httpRequestDuration.observe(labels, Date.now() - start);
        httpRequestsInFlight.dec();
    });

    next();
}

// ==========================================
// MÉTRICAS DE WEBSOCKET — Socket.IO /chat
// ==========================================

export const socketConnectionsActive = new Gauge({
    name:      'api_socket_connections_active',
    help:      'Conexões Socket.IO ativas no namespace /chat.',
    registers: [registry],
});

export const socketMessagesTotal = new Counter({
    name:       'api_socket_messages_total',
    help:       'Total de eventos Socket.IO recebidos no namespace /chat.',
    labelNames: ['event'] as const,
    registers:  [registry],
});

export const socketAuthFailuresTotal = new Counter({
    name:      'api_socket_auth_failures_total',
    help:      'Falhas de autenticação no middleware Socket.IO /chat.',
    registers: [registry],
});

export const socketRateLimitedTotal = new Counter({
    name:      'api_socket_rate_limited_total',
    help:      'Mensagens descartadas por rate limit no Socket.IO /chat.',
    registers: [registry],
});

// ==========================================
// SERVIDOR HTTP DE MÉTRICAS
// ==========================================

export function startMetricsServer(): void {
    const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        if (req.url === '/metrics' && req.method === 'GET') {
            try {
                res.setHeader('Content-Type', registry.contentType);
                res.end(await registry.metrics());
            } catch {
                res.writeHead(500);
                res.end('Erro ao coletar métricas.');
            }
        } else if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(METRICS_PORT, () => {
        console.log(`📊 [Metrics] Prometheus endpoint em http://localhost:${METRICS_PORT}/metrics`);
    });

    server.on('error', (err) => {
        console.error('❌ [Metrics] Erro no servidor de métricas:', err);
    });
}
