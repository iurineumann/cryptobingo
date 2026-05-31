// apps/worker-game-loop/src/index.ts

import dotenv from 'dotenv';
dotenv.config();

import { connectRabbitMQ }    from './services/rabbitmq';
import { startBroadcaster }   from './services/broadcaster';
import { startMetricsServer } from './services/metrics';
import { ensureFirstGameForActiveRooms } from './services/roomManager';

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

    // ── 2. Servidor WebSocket Broadcaster (porta WS_PORT / 8085) ─────────────
    // Iniciado antes do RabbitMQ para estar pronto para conexões de clientes
    // quando o primeiro evento 'startdraw' chegar.
    startBroadcaster();

    // ── 3. Consumidor RabbitMQ ────────────────────────────────────────────────
    await connectRabbitMQ();

    // ── 4. Polling de primeiro jogo para salas ativas ─────────────────────────
    // Verifica a cada 30s se há salas ativas sem jogo atual e cria o primeiro.
    ensureFirstGameForActiveRooms();
    setInterval(ensureFirstGameForActiveRooms, 30_000);
}

bootstrap().catch((err) => {
    console.error('❌ [Bootstrap] Falha crítica:', err);
    process.exit(1);
});
