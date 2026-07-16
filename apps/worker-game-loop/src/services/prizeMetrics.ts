import { Counter, Histogram, Gauge } from 'prom-client';
import { registry } from './metrics';

export const prizePaymentsTotal = new Counter({
    name: 'worker_prize_payments_total',
    help: 'Total de prêmios pagos por tipo e moeda',
    labelNames: ['winType', 'currency'] as const,
    registers: [registry],
});

export const prizePaymentsAmountTotal = new Counter({
    name: 'worker_prize_payment_amount_total',
    help: 'Soma total dos valores pagos por moeda',
    labelNames: ['currency'] as const,
    registers: [registry],
});

export const prizePipelineDuration = new Histogram({
    name: 'worker_prize_pipeline_duration_ms',
    help: 'Duração entre etapas do pipeline de prêmio',
    labelNames: ['action'] as const,
    buckets: [100, 500, 1000, 2500, 5000, 10000, 30000, 60000],
    registers: [registry],
});

export const prizePersistTotal = new Counter({
    name: 'worker_prize_persist_total',
    help: 'Resultado da persistência de prêmio no MongoDB',
    labelNames: ['result'] as const,
    registers: [registry],
});

export const buyinPersistedTotal = new Counter({
    name: 'worker_buyin_persisted_total',
    help: 'Total de buy-ins persistidos por moeda',
    labelNames: ['currency'] as const,
    registers: [registry],
});

export const prizePaymentsTxTotal = new Counter({
    name: 'worker_prize_payments_tx_total',
    help: 'Total de transações on-chain de pagamento (cai com batch)',
    labelNames: ['currency'] as const,
    registers: [registry],
});

export const payoutChunksTotal = new Counter({
    name: 'worker_payout_chunks_total',
    help: 'Total de chunks de payout publicados na fila',
    labelNames: ['mode'] as const,
    registers: [registry],
});

export const payoutRetriesTotal = new Counter({
    name: 'worker_payout_retries_total',
    help: 'Total de retentativas de payout',
    labelNames: ['mode'] as const,
    registers: [registry],
});

export const payoutRecoveredTotal = new Counter({
    name: 'worker_payout_recovered_total',
    help: 'Total de payouts recuperados por auto-advance',
    labelNames: ['mode'] as const,
    registers: [registry],
});

export const prizeRtpRatio = new Gauge({
    name: 'worker_prize_rtp_ratio',
    help: 'RTP da partida atual (prizes / buyins)',
    labelNames: ['currency'] as const,
    registers: [registry],
});
