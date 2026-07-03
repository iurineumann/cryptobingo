import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

import { setAuthToken, getReferralStatus, generateReferralCode, applyReferralCode } from '../api';

beforeEach(() => {
    vi.clearAllMocks();
    setAuthToken('test-jwt');
});

describe('getReferralStatus', () => {
    it('retorna status do referral do usuario', async () => {
        const data = { code: 'ABC123', totalReferred: 3, tier: 'bronze_referrer', referred: ['a', 'b', 'c'] };
        mockFetch.mockResolvedValue({ ok: true, json: async () => data });
        const result = await getReferralStatus();
        expect(result).toEqual(data);
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/referral/status'),
            expect.objectContaining({ headers: expect.objectContaining({ Authorization: expect.stringContaining('Bearer') }) }),
        );
    });

    it('lanca erro em resposta nao-ok', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 401 });
        await expect(getReferralStatus()).rejects.toThrow();
    });
});

describe('generateReferralCode', () => {
    it('cria e retorna codigo', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => ({ code: 'XYZ789' }) });
        const result = await generateReferralCode();
        expect(result.code).toBe('XYZ789');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/referral/generate'),
            expect.objectContaining({ method: 'POST' }),
        );
    });
});

describe('applyReferralCode', () => {
    it('aplica codigo de referral', async () => {
        mockFetch.mockResolvedValue({ ok: true, json: async () => ({ message: 'Aplicado!', referrer: 'ref.wam' }) });
        const result = await applyReferralCode('REF123');
        expect(result.message).toBe('Aplicado!');
        expect(mockFetch).toHaveBeenCalledWith(
            expect.stringContaining('/referral/apply'),
            expect.objectContaining({
                method: 'POST',
                body: expect.stringContaining('REF123'),
            }),
        );
    });

    it('lanca erro em resposta nao-ok', async () => {
        mockFetch.mockResolvedValue({ ok: false, status: 404 });
        await expect(applyReferralCode('INVALID')).rejects.toThrow();
    });
});
