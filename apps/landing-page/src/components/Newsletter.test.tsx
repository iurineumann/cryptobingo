import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Newsletter from './Newsletter';

const mockSubscribe = vi.fn();

vi.mock('@/lib/api', () => ({
    subscribe: (...args: unknown[]) => mockSubscribe(...args),
}));

describe('Newsletter', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders heading and form', () => {
        render(<Newsletter />);
        expect(screen.getByRole('heading', { name: /newsletter.title/i })).toBeInTheDocument();
        expect(screen.getByPlaceholderText('newsletter.placeholder')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /newsletter.submit/i })).toBeInTheDocument();
    });

    it('shows error for invalid email', async () => {
        const user = userEvent.setup();
        render(<Newsletter />);
        const input = screen.getByPlaceholderText('newsletter.placeholder');
        await user.type(input, 'invalid');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('calls subscribe on valid email', async () => {
        mockSubscribe.mockResolvedValueOnce({ message: 'Subscribed!' });
        const user = userEvent.setup();
        render(<Newsletter />);
        const input = screen.getByPlaceholderText('newsletter.placeholder');
        await user.type(input, 'test@example.com');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        expect(mockSubscribe).toHaveBeenCalledWith('test@example.com');
    });

    it('shows success message after subscribe', async () => {
        mockSubscribe.mockResolvedValueOnce({ message: 'Subscribed!' });
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText('newsletter.placeholder'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        expect(await screen.findByTestId('newsletter-success')).toBeInTheDocument();
    });

    it('shows error on subscribe failure', async () => {
        mockSubscribe.mockRejectedValueOnce(new Error('Already subscribed'));
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText('newsletter.placeholder'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /newsletter.submit/i }));
        expect(await screen.findByRole('alert')).toHaveTextContent(/already subscribed/i);
    });
});
