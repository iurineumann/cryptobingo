// apps/escrow-service/src/index.ts
// Servico off-chain do bingoescrow — vigia burns e dispara releaseburn.
//
// Componentes:
//   stateWatcher — hof streming/Firehose) que detecta logburnasset
//     e publica evento na fila RabbitMQ escrow_burn_events.
//   consumer     — consome a fila e chama bingogamescr::releaseburn
//     assinando com a permissao `bot` (MICROSERVICE_PRIVATE_KEY).
//
// Fase 3 — esboco funcional.

import dotenv from 'dotenv';
dotenv.config();

import { startStateWatcher } from './stateWatcher';
import { startConsumer }     from './consumer';
import { logger }            from './logger';

async function main(): Promise<void> {
  logger.info('Escrow service iniciando...');

  await startStateWatcher();
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
