import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createRoutesStub } from 'react-router';
import ReferralRedirect from '../pages/ReferralRedirect';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

        expect(screen.getByText('redirect.redirecting')).toBeDefined();
        expect(window.location.replace).toHaveBeenCalledWith('https://app.cryptobingo.bet/?ref=ABC123');
    });

    it('navega para app sem code', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const Stub = createRoutesStub([
            { path: '/ref', Component: ReferralRedirect },
        ]);

        render(<Stub initialEntries={['/ref']} />);

        expect(window.location.replace).not.toHaveBeenCalled();
    });
});
