import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (k: string) => k }),
}));

const mockGetStatus = vi.fn();
const mockGenerateCode = vi.fn();
const mockApplyCode = vi.fn();

vi.mock('../../services/api', () => ({
    getReferralStatus: (...args: unknown[]) => mockGetStatus(...args),
    generateReferralCode: (...args: unknown[]) => mockGenerateCode(...args),
    applyReferralCode: (...args: unknown[]) => mockApplyCode(...args),
}));

import ReferralPage from '../ReferralPage';

beforeEach(() => {
    vi.clearAllMocks();
});

describe('ReferralPage', () => {
    it('renderiza codigo e stats', async () => {
        mockGetStatus.mockResolvedValue({
            code: 'ABC123',
            totalReferred: 3,
            xpEarned: 150,
            ticketsEarned: 2,
            referred: ['user1.wam', 'user2.wam', 'user3.wam'],
            tier: 'bronze_referrer',
            nextTier: { min: 10, badge: 'silver_referrer', remaining: 7 },
        });

        render(React.createElement(ReferralPage));

        await waitFor(() => {
            expect(screen.getByText('ABC123')).toBeDefined();
        });

        expect(screen.getByText('3')).toBeDefined();
        expect(screen.getByText('150')).toBeDefined();
        expect(screen.getByText('2')).toBeDefined();
        expect(screen.getByText('Bronze')).toBeDefined();
    });

    it('botao copiar existe e tem aria-label', async () => {
        mockGetStatus.mockResolvedValue({
            code: 'ABC123', totalReferred: 0, xpEarned: 0, ticketsEarned: 0,
            referred: [], tier: null, nextTier: null,
        });

        render(React.createElement(ReferralPage));

        await waitFor(() => expect(screen.getByText('ABC123')).toBeDefined());

        const copyBtn = screen.getByTestId('referral-copy-btn');
        expect(copyBtn).toBeDefined();
        expect(copyBtn.getAttribute('aria-label')).toBe('referral.copy_code');
    });

    it('aplica codigo de referral', async () => {
        mockGetStatus.mockResolvedValue({
            code: 'MYCODE', totalReferred: 0, xpEarned: 0, ticketsEarned: 0,
            referred: [], tier: null, nextTier: null,
        });
        mockApplyCode.mockResolvedValue({ message: 'Aplicado!', referrer: 'ref.wam' });

        const user = userEvent.setup();
        render(React.createElement(ReferralPage));

        await waitFor(() => expect(screen.getByTestId('referral-apply-input')).toBeDefined());

        const input = screen.getByTestId('referral-apply-input') as HTMLInputElement;
        await user.type(input, 'REF123');
        await user.click(screen.getByTestId('referral-apply-btn'));

        expect(mockApplyCode).toHaveBeenCalledWith('REF123');
        await waitFor(() => {
            expect(screen.getByText('Aplicado!')).toBeDefined();
        });
    });
});
