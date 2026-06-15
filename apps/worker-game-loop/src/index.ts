// apps/worker-game-loop/src/index.ts

import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import { connectRabbitMQ, autoLockFundingGames, autoStartLockedGames, autoClaimDrawnGames } from './services/rabbitmq';
import { startBroadcaster }   from './services/broadcaster';
import { startMetricsServer } from './services/metrics';
import { ensureFirstGameForActiveRooms } from './services/roomManager';
import { connectRedis }        from './services/redis';

console.log('=============================================');
console.log('🤖 CryptoBingo: Game Loop Worker Iniciando...');
console.log('=============================================');

async function bootstrap(): Promise<void> {
    // ── Guarda de configuração crítica ────────────────────────────────────────
    if (!process.env.MICROSERVICE_PRIVATE_KEY) {
        console.error('❌ ERRO CRÍTICO: MICROSERVICE_PRIVATE_KEY não definida no .env');
        process.exit(1);
    }

    if (!process.env.JWT_SECRET) {
        console.warn('⚠️  JWT_SECRET não definida. Auth WebSocket desabilitada (apenas DEV).');
    }

    // ── 1. Servidor de métricas Prometheus (porta METRICS_PORT / 9091) ────────
    // Iniciado primeiro para estar disponível desde o início do processo.
    startMetricsServer();

    // ── 2. MongoDB (Chat persistence) ─────────────────────────────────────────
    await mongoose.connect(process.env.MONGO_URL as string);
    console.log('✅ [MongoDB] Conectado (chat).');

    // ── 3. Redis (Inverted Index) ─────────────────────────────────────────────
    await connectRedis();

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

    // ── 5. Consumidor RabbitMQ (fire-and-forget — reconecta internamente) ─────
    // Não await: a conexão pode demorar ou precisar de retry sem bloquear o worker.
    connectRabbitMQ();
}

bootstrap().catch((err) => {
    console.error('❌ [Bootstrap] Falha crítica:', err);
    process.exit(1);
});
