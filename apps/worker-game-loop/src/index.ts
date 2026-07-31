// apps/worker-game-loop/src/index.ts

import dotenv from 'dotenv';
dotenv.config();

require('./instrumentation');

import mongoose from 'mongoose';
import { connectRabbitMQ, autoLockFundingGames, autoStartLockedGames, autoClaimDrawnGames, recoverStuckGames, recoverPayoutGames } from './services/rabbitmq';
import { startBroadcaster }   from './services/broadcaster';
import { startMetricsServer } from './services/metrics';
import { ensureFirstGameForActiveRooms } from './services/roomManager';
import { connectRedis }        from './services/redis';
import { startBurnSyncCron }   from './services/burnCron';
import { startBlockchainIndexer } from './services/blockchainIndexer';
import { startStateWatcher } from './services/stateWatcher';
import { logger } from './services/logger';

logger.info('=============================================');
logger.info({ tag: 'Bootstrap' }, 'CryptoBingo: Game Loop Worker Iniciando...');
logger.info('=============================================');

export async function bootstrap(): Promise<void> {
    // ── Guarda de configuração crítica ────────────────────────────────────────
    if (!process.env.MICROSERVICE_PRIVATE_KEY) {
        logger.error('ERRO CRÍTICO: MICROSERVICE_PRIVATE_KEY não definida no .env');
        process.exit(1);
    }

    if (!process.env.JWT_SECRET) {
        logger.warn('JWT_SECRET não definida. Auth WebSocket desabilitada (apenas DEV).');
    }

    // ── 1. Servidor de métricas Prometheus (porta METRICS_PORT / 9091) ────────
    // Iniciado primeiro para estar disponível desde o início do processo.
    startMetricsServer();

    // ── 2. MongoDB (Chat persistence) ─────────────────────────────────────────
    await mongoose.connect(process.env.MONGO_URL as string);
    logger.info({ tag: 'MongoDB' }, 'Conectado (chat).')

    // ── 3. Redis (Inverted Index) ─────────────────────────────────────────────
    await connectRedis();

    // ── 3b. Blockchain Indexer (popula games_history/ledger p/ stats públicos) ─
    // Varre a tabela `games` on-chain e sincroniza games_history no PostgreSQL.
    // Depende do Redis (cursor indexer:last_game_name). Sem isto, games_history
    // fica vazio e GET /api/stats/game retorna total_games:0 (bug de wiring).
    startBlockchainIndexer().catch(err =>
        logger.error({ err, tag: 'Bootstrap' }, 'Erro ao iniciar blockchainIndexer:')
    );

    // ── 4. Servidor WebSocket Broadcaster (porta WS_PORT / 8085) ─────────────
    startBroadcaster();

    // ── 4. Auto-advance do ciclo de vida (independente do RabbitMQ) ───────────
    // Roda via RPC direto na blockchain — não depende do Message Broker.
    // Iniciado ANTES do connectRabbitMQ para garantir que os timers rodem mesmo
    // que a conexão AMQP demore ou falhe na primeira tentativa.
    ensureFirstGameForActiveRooms();
    setInterval(ensureFirstGameForActiveRooms, 30_000);

    autoLockFundingGames();
    autoClaimDrawnGames();
    autoStartLockedGames();  // processa jogos em LOCKED que existiam antes do worker iniciar
    setInterval(autoLockFundingGames,  15_000);
    setInterval(autoClaimDrawnGames,   15_000);
    setInterval(autoStartLockedGames,  30_000);

    // ── 4b. Startup recovery scan + recovery periódico ───────────────────────
    // Recupera jogos em DRAWING com balls completas (crash após oracle responder)
    // e jogos LOCKED que precisam de sorteio (não cobertos pelo auto-advance inicial).
    // Também aborta jogos em DRAWING sem tickets (cancelamento por zero venda).
    // É PERIÓDICO (não só no startup) — caso contrário, drawings presos após
    // restart do worker ficam travados para sempre.
    recoverStuckGames().catch(err =>
        logger.error({ err, tag: 'Bootstrap' }, 'Erro no recovery scan:')
    );
    setInterval(() => {
        recoverStuckGames().catch(err =>
            logger.error({ err, tag: 'Recovery' }, 'Erro no recovery periódico:')
        );
    }, 60_000);

    // ── 4c. Recovery de payout (Fase 2 #369) ───────────────────────────
    recoverPayoutGames().catch(err =>
        logger.error({ err, tag: 'Bootstrap' }, 'Erro no payout recovery scan:')
    );
    setInterval(() => {
        recoverPayoutGames().catch(err =>
            logger.error({ err, tag: 'Recovery' }, 'Erro no payout recovery periódico:')
        );
    }, 30_000);

    // ── 5. Burn sync cron (ADR-028 §8) ────────────────────────────────────────
    startBurnSyncCron();

    // ── 6. Consumidor RabbitMQ (fire-and-forget — reconecta internamente) ─────
    // Não await: a conexão pode demorar ou precisar de retry sem bloquear o worker.
    connectRabbitMQ();

    // ── 7. State Watcher (Firehose/Hyperion) — publica eventos em tempo real ──
    startStateWatcher();
}

// NOTA (2026-07-31): Rota 3 (Escrow Burn Watcher + releaseburn) REMOVIDA do worker.
// Era resquício da época em que o escrow foi mesclado no worker. O escrow-service
// (apps/escrow-service) é o dono legítimo: detecta burns, publica em escrow_burn_events
// e chama releaseburn (bingogamescr@bot). burnCron (ADR-028 §8) permanece — é engine
// do jogo (recordburn + XP), NÃO é escrow.

// NOSONAR (S7785) — módulo CJS não suporta top-level await; padrão .catch() é o equivalente seguro
// Só auto-executa quando é o entrypoint real (evita disparar no import sob testes).
if (require.main === module) {
    bootstrap().catch((err) => {
        logger.error({ err, tag: 'Bootstrap' }, 'Falha crítica:')
        process.exit(1);
    });
}
