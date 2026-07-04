import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Newsletter from '../Newsletter';

const mockSubscribe = vi.fn();

vi.mock('@/lib/api', () => ({
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
}));

describe('Newsletter analytics', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.dataLayer = [];
        (window as any)._analyticsConsented = true;
    });

    it('should push newsletter_subscribe on successful subscribe', async () => {
        mockSubscribe.mockResolvedValueOnce({ message: 'Subscribed!' });
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText('newsletter.placeholder'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        await screen.findByTestId('newsletter-success');
        expect(window.dataLayer).toContainEqual(
            expect.objectContaining({ event: 'newsletter_subscribe', method: 'api' })
        );
    });

    it('should push newsletter_error on failed subscribe', async () => {
        mockSubscribe.mockRejectedValueOnce(new Error('Already subscribed'));
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText('newsletter.placeholder'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        await screen.findByRole('alert');
        expect(window.dataLayer).toContainEqual(
            expect.objectContaining({ event: 'newsletter_error', error_type: 'Error', error_message: 'Already subscribed' })
        );
    });
});
