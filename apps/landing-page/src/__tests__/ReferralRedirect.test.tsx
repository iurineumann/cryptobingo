import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import ReferralRedirect from '../pages/ReferralRedirect';

describe('ReferralRedirect', () => {
    const origLocation = window.location;

    beforeEach(() => {
        vi.stubGlobal('location', {
            ...origLocation,
            replace: vi.fn(),
        });
    });

    it('redireciona para app com ref na query', () => {
        const Stub = createRoutesStub([
            { path: '/ref/:code', Component: ReferralRedirect },
        ]);

        render(<Stub initialEntries={['/ref/ABC123']} />);

        expect(screen.getByText('Redirecionando...')).toBeDefined();
        expect(window.location.replace).toHaveBeenCalledWith('https://app.cryptobingo.bet/?ref=ABC123');
    });
});
