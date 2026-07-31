// apps/escrow-service/src/metrics.ts
// Métricas Prometheus do escrow-service — registry isolado com prefixo escrow_.
//
// Grill (2026-07-30):
//  - M1: label error_type NORMALIZADO (categorias fixas — nunca err.message cru,
//    que pode vazar wallet/asset_id/amount no /metrics).
//  - Business counters (9.15): nfts_bought, nfts_redeemed, revenue.
//  - GA4 events ficam para a Fase D (decisão do usuário).

import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from 'prom-client';

export const registry = new Registry();
collectDefaultMetrics({ register: registry, prefix: 'escrow_' });

// ─── Contadores de evento ──────────────────────────────────────────────

/** Eventos recebidos do watcher, particionados por action. */
export const eventsReceived = new Counter({
  name: 'escrow_events_received_total',
  help: 'Eventos on-chain recebidos pelo watcher, por action.',
  labelNames: ['action'],
});

/** Atualizações de cache Redis, por chave. */
export const cacheUpdates = new Counter({
  name: 'escrow_cache_updates_total',
  help: 'Atualizações de cache Redis, por chave.',
  labelNames: ['key'],
});

/** Reconciliações completas executadas. */
export const reconciliations = new Counter({
  name: 'escrow_reconciliations_total',
  help: 'Reconciliações completas executadas.',
  labelNames: ['trigger'], // 'startup' | 'scheduled' | 'error' | 'forced'
});

/** Erros nos handlers/reconciliação — error_type SEMPRE normalizado. */
export const handlerErrors = new Counter({
  name: 'escrow_handler_errors_total',
  help: 'Erros nos handlers de evento ou reconciliação (error_type normalizado).',
  labelNames: ['handler', 'error_type'],
});

// ─── Gauges de estado ──────────────────────────────────────────────────

/** Último global_seq processado pelo watcher. */
export const cursorPosition = new Gauge({
  name: 'escrow_cursor_position',
  help: 'Último global_seq processado.',
});

/** Fonte ativa do watcher: 1=firehose, 0=hyperion. */
export const watcherSource = new Gauge({
  name: 'escrow_watcher_source',
  help: 'Fonte atual do watcher: 1=firehose, 0=hyperion.',
});

/** Staleness do cache em segundos desde a última atualização. */
export const cacheStaleness = new Gauge({
  name: 'escrow_cache_staleness_seconds',
  help: 'Segundos desde a última atualização do cache.',
});

// ─── Histogramas ───────────────────────────────────────────────────────

/** Duração do scan de reconciliação. */
export const reconciliationDuration = new Histogram({
  name: 'escrow_reconciliation_duration_seconds',
  help: 'Duração do scan de reconciliação.',
  buckets: [1, 5, 10, 30, 60, 120],
});

// ─── Business counters (checklist 9.15 — sem GA4, só Prometheus) ───────

/** NFTs comprados (detectados no logmint com authorized_minter == bingogamescr). */
export const nftsBought = new Counter({
  name: 'escrow_nfts_bought_total',
  help: 'NFTs comprados via escrow (total de mints).',
});

/** NFTs resgatados (receive_asset com memo redeem + releaseburn). */
export const nftsRedeemed = new Counter({
  name: 'escrow_nfts_redeemed_total',
  help: 'NFTs resgatados (redeem + releaseburn).',
});

/** Faturamento em WAX de compras com memo "buy:" (on_transfer para o escrow). */
export const revenueTotal = new Counter({
  name: 'escrow_revenue_total',
  help: 'Faturamento total de compras via escrow (memo buy:), em unidades mínimas.',
});

// Registra tudo no registry isolado.
registry.registerMetric(eventsReceived);
registry.registerMetric(cacheUpdates);
registry.registerMetric(reconciliations);
registry.registerMetric(handlerErrors);
registry.registerMetric(cursorPosition);
registry.registerMetric(watcherSource);
registry.registerMetric(cacheStaleness);
registry.registerMetric(reconciliationDuration);
registry.registerMetric(nftsBought);
registry.registerMetric(nftsRedeemed);
registry.registerMetric(revenueTotal);
