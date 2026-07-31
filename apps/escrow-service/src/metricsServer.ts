// apps/escrow-service/src/metricsServer.ts
// Servidor HTTP de métricas Prometheus na porta METRICS_PORT (default 9093).
// Padrão idêntico ao worker (9091) e api-gateway (9092).
//
// ⚠️ prom-client v15: registry.metrics() é ASSÍNCRONO (retorna Promise).
// res.end(registry.metrics()) sem await crasha com ERR_INVALID_ARG_TYPE
// quando o Prometheus scrapeia (achado ao vivo 2026-07-31 no VPS).

import { createServer } from 'http';
import { registry } from './metrics';
import { logger } from './logger';

const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT ?? '9093', 10);

export function startMetricsServer(): void {
  const server = createServer(async (req, res) => {
    try {
      if (req.url === '/metrics') {
        res.writeHead(200, { 'Content-Type': registry.contentType });
        res.end(await registry.metrics());
      } else if (req.url === '/health' || req.url === '/readyz') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, service: 'escrow-service' }));
      } else {
        res.writeHead(200);
        res.end('ok');
      }
    } catch (err) {
      logger.error({ err }, 'Metrics server handler error');
      res.writeHead(500);
      res.end('internal error');
    }
  });

  server.listen(METRICS_PORT, () => {
    logger.info({ port: METRICS_PORT }, 'Metrics server started');
  });

  server.on('error', (err) => {
    logger.error({ err, port: METRICS_PORT }, 'Metrics server error');
  });
}
