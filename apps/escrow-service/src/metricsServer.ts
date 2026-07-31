// apps/escrow-service/src/metricsServer.ts
// Servidor HTTP de métricas Prometheus na porta METRICS_PORT (default 9093).
// Padrão idêntico ao worker (9091) e api-gateway (9092).

import { createServer } from 'http';
import { registry } from './metrics';
import { logger } from './logger';

const METRICS_PORT = Number.parseInt(process.env.METRICS_PORT ?? '9093', 10);

export function startMetricsServer(): void {
  const server = createServer((req, res) => {
    if (req.url === '/metrics') {
      res.writeHead(200, { 'Content-Type': registry.contentType });
      res.end(registry.metrics());
    } else if (req.url === '/health' || req.url === '/readyz') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, service: 'escrow-service' }));
    } else {
      res.writeHead(200);
      res.end('ok');
    }
  });

  server.listen(METRICS_PORT, () => {
    logger.info({ port: METRICS_PORT }, 'Metrics server started');
  });

  server.on('error', (err) => {
    logger.error({ err, port: METRICS_PORT }, 'Metrics server error');
  });
}
