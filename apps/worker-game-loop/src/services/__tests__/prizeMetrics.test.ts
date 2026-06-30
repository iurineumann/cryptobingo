import { prizePaymentsTotal, prizeRtpRatio, prizePipelineDuration } from '../prizeMetrics';

it('exports prizePaymentsTotal', () => {
    expect(prizePaymentsTotal).toBeDefined();
    expect(prizePaymentsTotal.name).toBe('worker_prize_payments_total');
});

it('exports prizeRtpRatio', () => {
    expect(prizeRtpRatio).toBeDefined();
    expect(prizeRtpRatio.name).toBe('worker_prize_rtp_ratio');
});

it('exports prizePipelineDuration', () => {
    expect(prizePipelineDuration).toBeDefined();
    expect(prizePipelineDuration.name).toBe('worker_prize_pipeline_duration_ms');
});
