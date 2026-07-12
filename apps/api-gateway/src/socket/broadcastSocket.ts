// apps/api-gateway/src/socket/broadcastSocket.ts
// Broadcaster de SLOW REVEAL (ADR-007) hospedado no API GATEWAY.
//
// ANTES (BUG #259): o broadcaster rodava no WORKER (porta 8085, não exposta),
// e o frontend conectava em `wss://test-api.cryptobingo.bet` (api-gateway, que só
// tinha o chat). Resultado: o worker emitia `ball_drawn` para uma porta interna
// inalcançável → o reveal ao vivo nunca chegava ao cliente.
//
// AGORA (Opção A aprovada): o gateway hospeda o broadcaster de reveal (reutiliza o
// `io` do Socket.io já exposto em test-api). O WORKER publica os eventos de reveal
// em Redis pub/sub (`bc:reveal`); este módulo assina e re-emite via `io.to(room)`.
//
// Formato da mensagem Redis (publicada pelo worker):
//   { type: string, gameId: string, payload: any }
//
// O frontend (useSlowReveal) conecta no default namespace e faz
// `socket.emit('subscribe', { game_id })` → este módulo faz `socket.join(`game:${game_id}`)`.

import { Server, Socket } from 'socket.io';
import { redisClient } from '../database/redis';
import { logger } from '../middleware/logger';

// Canal Redis pub/sub onde o worker publica os eventos de reveal
const REVEAL_CHANNEL = 'bc:reveal';

// Sessões de reveal ativas (espelho leve do worker) para suportar reconciliação `sync`.
// key = gameId; value = { balls: number[], currentIdx: number }
const activeSessions = new Map<string, { balls: number[]; currentIdx: number }>();

// Reconciliação: cliente que perdeu bolas pede `sync` (ADR-007 §4)
interface SyncData { game_id: number; last_order: number }

export function setupBroadcastSocket(io: Server): void {
  // ── Subscriber Redis dedicado (não bloqueia o client principal) ──
  const sub = redisClient.duplicate();
  sub.on('error', (err) => logger.error({ err, tag: 'BroadcastWS' }, 'Erro no subscriber Redis do broadcaster:'));
  sub.subscribe(REVEAL_CHANNEL, (err) => {
    if (err) logger.error({ err, tag: 'BroadcastWS' }, `Falha ao assinar ${REVEAL_CHANNEL}:`);
    else logger.info({ tag: 'BroadcastWS' }, `Assinando canal Redis ${REVEAL_CHANNEL} (reveal).`);
  });

  sub.on('message', (_channel, message) => {
    try {
      const msg = JSON.parse(message) as {
        type: string;
        gameId: string;
        payload: any;
      };
      const room = `game:${msg.gameId}`;

      // Espelha ball_drawn em activeSessions para suportar `sync` do cliente
      if (msg.type === 'ball_drawn') {
        const ball = msg.payload?.payload?.number ?? msg.payload?.number;
        let session = activeSessions.get(msg.gameId);
        if (!session) { session = { balls: [], currentIdx: 0 }; activeSessions.set(msg.gameId, session); }
        if (typeof ball === 'number') session.balls.push(ball);
        session.currentIdx = session.balls.length;
      }

      // Re-emite QUALQUER tipo de evento de reveal para a room.
      // Cobre: ball_drawn, winner_found, golden_ball, golden_multiplier_progress,
      // stage_cleared, game_ended, prize_tx_sent, prize_confirmed, game_locked, game_aborted.
      io.to(room).emit(msg.type, msg.payload);

      // Encerra a sessão espelhada quando o reveal termina/aborta
      if (msg.type === 'game_ended' || msg.type === 'game_aborted') {
        activeSessions.delete(msg.gameId);
      }
    } catch (err) {
      logger.error({ err, tag: 'BroadcastWS' }, 'Falha ao processar mensagem Redis de reveal:');
    }
  });

  // ── Handlers do cliente (default namespace, compatível com useSlowReveal) ──
  io.on('connection', (socket: Socket) => {
    const wallet = (socket.handshake.auth?.wallet as string | undefined) ?? 'anon';

    socket.on('subscribe', (data: { game_id: number }) => {
      const gameId = String(data?.game_id);
      if (!gameId) return;
      const room = `game:${gameId}`;
      socket.join(room);
      logger.info({ tag: 'BroadcastWS' }, `Cliente ${socket.id} (${wallet}) subscreveu ${room}`);

      // Se o reveal já está em andamento, envia reconciliação imediata (ADR-007 §4)
      const session = activeSessions.get(gameId);
      if (session && session.currentIdx > 0) {
        const missed = session.balls.map((number, i) => ({
          order: i + 1,
          number,
          timestamp: new Date().toISOString(),
        }));
        socket.emit('sync_response', { game_id: parseInt(gameId, 10), from_order: 1, balls: missed });
        logger.info({ tag: 'BroadcastWS' }, `Sync imediato: ${missed.length} bola(s) para ${wallet} (jogo ${gameId})`);
      }
    });

    socket.on('sync', (data: SyncData) => {
      const gameId = String(data?.game_id);
      const lastOrder = data?.last_order ?? 0;
      const session = activeSessions.get(gameId);
      if (!session) {
        socket.emit('error', { message: `Jogo ${gameId} sem reveal ativo.` });
        return;
      }
      const missedBalls = session.balls
        .slice(lastOrder, session.currentIdx)
        .map((number, i) => ({
          order: lastOrder + i + 1,
          number,
          timestamp: new Date().toISOString(),
        }));
      if (missedBalls.length > 0) {
        socket.emit('sync_response', {
          game_id: parseInt(gameId, 10),
          from_order: lastOrder + 1,
          balls: missedBalls,
        });
        logger.info(
          `🔄 [WS] Reconciliação: ${missedBalls.length} bola(s) reenviadas para ${wallet} (jogo ${gameId}, a partir do order ${lastOrder + 1})`,
        );
      }
    });

    socket.on('disconnect', (reason) => {
      logger.info({ tag: 'BroadcastWS' }, `Desconectado: ${socket.id} (${wallet}) — ${reason}`);
    });
  });

  logger.info({ tag: 'BroadcastWS' }, 'Broadcaster de reveal inicializado no api-gateway (Socket.IO default namespace, re-emissão genérica de bc:reveal).');
}
