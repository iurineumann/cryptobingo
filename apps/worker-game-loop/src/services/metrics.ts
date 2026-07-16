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

import { createServer } from 'node:http';
import {
    Registry,
    Counter,
    Histogram,
    Gauge,
    collectDefaultMetrics,
} from 'prom-client';
import { redisConnected, rabbitConnected } from './connectionState';
import { logger } from './logger';

const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT ?? '9091', 10);

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

/** Profundidade das filas RabbitMQ (mensagens pendentes por fila). */
export const queueDepth = new Gauge({
    name:       'worker_queue_depth',
    help:       'Mensagens pendentes por fila RabbitMQ.',
    labelNames: ['queue'] as const,
    registers:  [registry],
});

export function setQueueDepth(queue: string, count: number): void {
    queueDepth.set({ queue }, count);
}

/** Sessões de Slow Reveal em andamento (gauge). */
export const slowRevealSessionsActive = new Gauge({
    name:      'worker_slow_reveal_sessions_active',
    help:      'Número de sessões de Slow Reveal ativas simultaneamente.',
    registers: [registry],
});

// ==========================================
// MÉTRICAS DE RESOLUÇÃO DE JOGO (orchestrateGame)
// Cobrem o ciclo completo: reveal → avaliação → pagamento
// ==========================================

/** Jogos resolvidos com sucesso, por draw_mode. */
export const gameResolutionTotal = new Counter({
    name:       'worker_game_resolution_total',
    help:       'Total de jogos resolvidos com sucesso pelo orquestrador, por draw_mode.',
    labelNames: ['draw_mode', 'result'] as const,
    registers:  [registry],
});

/** Duração completa da resolução de jogo (reveal + pagamentos), por draw_mode. */
export const gameResolutionDuration = new Histogram({
    name:       'worker_game_resolution_duration_ms',
    help:       'Duração total da resolução de jogo (reveal + avaliação + payouts) em ms.',
    labelNames: ['draw_mode'] as const,
    buckets:    [1000, 5000, 15000, 30000, 60000, 90000, 120000, 180000],
    registers:  [registry],
});

/** Total de vencedores pagos por jogo, acumulado. */
export const gameWinnersTotal = new Counter({
    name:       'worker_game_winners_total',
    help:       'Total de vencedores pagos pelo orquestrador.',
    labelNames: ['draw_mode'] as const,
    registers:  [registry],
});

// ==========================================
// MÉTRICAS DE AUTOADVANCE (crons setInterval)
// Processos que bypassam o consumer RabbitMQ
// ==========================================

/** Execuções dos crons de AutoAdvance, por action. */
export const autoAdvanceRunsTotal = new Counter({
    name:       'worker_autoadvance_runs_total',
    help:       'Total de execuções dos crons de AutoAdvance.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

/** Erros nos crons de AutoAdvance, por action. */
export const autoAdvanceErrorsTotal = new Counter({
    name:       'worker_autoadvance_errors_total',
    help:       'Total de erros nos crons de AutoAdvance.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

/** Eventos publicados na fila RabbitMQ, por action. */
export const workerQueuePublishedTotal = new Counter({
    name:       'worker_queue_published_total',
    help:       'Total de eventos publicados na fila do RabbitMQ.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

/** Jogos processados por cada cron de AutoAdvance. */
export const autoAdvanceGamesTotal = new Counter({
    name:       'worker_autoadvance_games_total',
    help:       'Total de jogos processados pelos crons de AutoAdvance.',
    labelNames: ['action'] as const,
    registers:  [registry],
});

// ==========================================
// MÉTRICAS DE XP / PROGRESSION (ADR-028)
// ==========================================

/** Total de operações de XP por tipo (game/streak/tier/purchase/burn/combo). */
export const xpAwardedTotal = new Counter({
    name:       'worker_xp_awarded_total',
    help:       'Total de operações de XP concedidas, por tipo.',
    labelNames: ['type'] as const,
    registers:  [registry],
});

/** Total de pontos de XP acumulados por tipo. */
export const xpAmountTotal = new Counter({
    name:       'worker_xp_amount_total',
    help:       'Total de pontos de XP concedidos, por tipo.',
    labelNames: ['type'] as const,
    registers:  [registry],
});

/** Erros em operações de XP, por tipo. */
export const xpErrorsTotal = new Counter({
    name:       'worker_xp_errors_total',
    help:       'Total de erros em operações de XP, por tipo.',
    labelNames: ['type'] as const,
    registers:  [registry],
});

/** Duração das operações de XP em ms. */
export const xpDurationHistogram = new Histogram({
    name:       'worker_xp_duration_ms',
    help:       'Duração das operações de XP em milissegundos.',
    labelNames: ['type'] as const,
    buckets:    [10, 25, 50, 100, 250, 500, 1000, 3000],
    registers:  [registry],
});

/** Total de achievements desbloqueados, por achievement_id. */
export const achievementsUnlockedTotal = new Counter({
    name:       'worker_achievements_unlocked_total',
    help:       'Total de achievements desbloqueados, por ID.',
    labelNames: ['achievement_id'] as const,
    registers:  [registry],
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
                logger.error({ err, tag: 'Metrics' }, 'Erro ao coletar métricas:')
                res.writeHead(500);
                res.end('Erro ao coletar métricas.');
            }
        } else if (req.url === '/health' && req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                status:    'ok',
                timestamp: new Date().toISOString(),
                services:  {
                    redis:   redisConnected  ? 'connected' : 'disconnected',
                    rabbit:  rabbitConnected ? 'connected' : 'disconnected',
                },
            }));
        } else if (req.url === '/readyz' && req.method === 'GET') {
            const ready = redisConnected && rabbitConnected;
            res.writeHead(ready ? 200 : 503, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({
                ready,
                timestamp: new Date().toISOString(),
                services:  {
                    redis:   redisConnected  ? 'connected' : 'disconnected',
                    rabbit:  rabbitConnected ? 'connected' : 'disconnected',
                },
            }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    server.listen(METRICS_PORT, () => {
        logger.info({ tag: 'Metrics' }, `Prometheus endpoint em http://localhost:${METRICS_PORT}/metrics`)
    });

    server.on('error', (err) => {
        logger.error({ err, tag: 'Metrics' }, 'Erro no servidor de métricas:')
    });
}
