// apps/escrow-service/src/index.ts
// Serviço off-chain do bingoescrow — cache event-driven + releaseburn.
//
// Componentes (Fase B):
//   metricsServer — Prometheus porta 9093 (registry isolado escrow_)
//   reconciliation — scan completo no startup (cursor==0) + 30min
//   stateWatcher  — Firehose/Hyperion (bingogamescr) → cache Redis + heartbeat
//   consumer      — fila escrow_burn_events → bingogamescr::releaseburn (bot)
//
// Ordem do bootstrap (grill M4): conectar Redis → métricas → reconciliação
// se cursor==0 → watcher → consumer.

import dotenv from 'dotenv';
dotenv.config();

import { connectRedis } from './redis';
import { startMetricsServer } from './metricsServer';
import { startStateWatcher } from './stateWatcher';
import { startConsumer } from './consumer';
import { runReconciliation, startReconciliationScheduler } from './reconciliation';
import { loadCursor } from './escrowCacheManager';
import { logger } from './logger';

async function main(): Promise<void> {
  logger.info('Escrow service iniciando...');

  // 1. Redis (obrigatório — REDIS_URL ausente crasha no load do módulo)
  await connectRedis();

  // 2. Métricas (porta 9093)
  startMetricsServer();

  // 3. Reconciliação inicial se nunca populou o cache (cursor == 0)
  const cursor = await loadCursor();
  if (cursor === 0) {
    logger.info('Cursor zerado — reconciliação completa no startup');
    await runReconciliation('startup');
  }
  startReconciliationScheduler();

  // 4. Watcher event-driven (Firehose → Hyperion fallback)
  await startStateWatcher();

  // 5. Consumer da fila de burns (releaseburn)
  await startConsumer();

  logger.info('Escrow service pronto.');

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM recebido — finalizando.');
    process.exit(0);
  });
  process.on('SIGINT', async () => {
    logger.info('SIGINT recebido — finalizando.');
    process.exit(0);
  });
}

main().catch((err) => {
  logger.error({ err }, 'Escrow service falhou ao iniciar');
  process.exit(1);
});
