// apps/worker-game-loop/src/services/metrics.ts
// Servidor de métricas Prometheus para o Game Loop Worker.
//
// Expõe /metrics na porta METRICS_PORT (padrão: 9091).
// O Prometheus faz scrape desta porta conforme prometheus.yml.
//
// Métricas expostas:
//   - events_processed_total         (counter, por action)
//   - events_failed_total            (counter, por action e reason)
//   - events_dead_lettered_total     (counter, por action)
//   - event_processing_duration_ms   (histogram, por action)
//   - oracle_poll_attempts           (histogram, por jogo)
//   - slow_reveal_balls_emitted_total (counter)
//   - ws_connections_active          (gauge)
//   - Node.js default metrics        (heap, GC, event loop lag)
//
// Ref: ADR-007 (observabilidade), ENGINEERING_PROTOCOL.md

import { createServer } from 'http';
import {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from 'prom-client';

const METRICS_PORT = parseInt(process.env.METRICS_PORT ?? '9091', 10);

// ==========================================
// REGISTRY ISOLADO
// Não usa o registry global — evita colisões com outras libs
// que eventualmente usem prom-client.
// ==========================================

export const registry = new Registry();

// Coleta métricas padrão do Node.js: heap, GC, event loop lag, handles
collectDefaultMetrics({ register: registry, prefix: 'worker_' });

// ==========================================
// DEFINIÇÃO DAS MÉTRICAS
// ==========================================

/** Eventos processados com sucesso, particionados por action. */
export const eventsProcessedTotal = new Counter({
    name:       'worker_events_processed_total',
    help:       'Total de eventos do game loop processados com sucesso.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

/** Eventos que falharam (transitório ou permanente), por action e razão. */
export const eventsFailedTotal = new Counter({
    name:       'worker_events_failed_total',
    help:       'Total de eventos que falharam durante o processamento.',
    labelNames: ['action', 'reason'] as const,
    registers:  [registry],
});

/**
 * Eventos descartados para a Dead Letter Queue (excederam MAX_RETRIES).
 * Indica erros permanentes que precisam de intervenção manual.
 */
export const eventsDeadLetteredTotal = new Counter({
    name:       'worker_events_dead_lettered_total',
    help:       'Eventos descartados para a DLQ por exceder o limite de retentativas.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

/**
 * Duração do processamento de cada evento em milissegundos.
 * Permite detectar gargalos por action (lockgame vs claimwin vs startdraw).
 */
export const eventProcessingDuration = new Histogram({
    name:       'worker_event_processing_duration_ms',
    help:       'Duração do processamento de eventos em milissegundos.',
    labelNames: ['action'] as const,
    buckets:    [50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000],
    registers:  [registry],
});

/**
 * Número de tentativas de polling para aguardar o oráculo.
 * Alta contagem indica oráculo lento ou indisponível.
 */
export const oraclePollAttempts = new Histogram({
    name:    'worker_oracle_poll_attempts',
    help:    'Número de tentativas de polling até o oráculo responder.',
    buckets: [1, 5, 10, 20, 30, 50, 75],
    registers: [registry],
});

/** Total de bolas emitidas pelo Slow Reveal (útil para calcular taxa de revelação). */
export const slowRevealBallsTotal = new Counter({
    name:      'worker_slow_reveal_balls_emitted_total',
    help:      'Total de bolas emitidas pelo Slow Reveal WebSocket.',
    registers: [registry],
});

/** Conexões WebSocket ativas no broadcaster (gauge — sobe e desce). */
export const wsConnectionsActive = new Gauge({
    name:      'worker_ws_connections_active',
    help:      'Número de conexões WebSocket ativas no broadcaster.',
    registers: [registry],
});

/** Sessões de Slow Reveal em andamento (gauge). */
export const slowRevealSessionsActive = new Gauge({
    name:      'worker_slow_reveal_sessions_active',
    help:      'Número de sessões de Slow Reveal ativas simultaneamente.',
    registers: [registry],
});

// ==========================================
// SERVIDOR HTTP DE MÉTRICAS
// ==========================================

/**
 * Inicia o servidor HTTP que expõe /metrics para o Prometheus.
 * Deve ser chamado uma vez no bootstrap do worker.
 */
export function startMetricsServer(): void {
    const server = createServer(async (req, res) => {
        if (req.url === '/metrics' && req.method === 'GET') {
            try {
                res.setHeader('Content-Type', registry.contentType);
                res.end(await registry.metrics());
            } catch (err) {
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
