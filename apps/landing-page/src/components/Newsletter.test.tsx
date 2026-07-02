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
        expect(screen.getByText('Stay Updated')).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/enter your email/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /subscribe/i })).toBeInTheDocument();
    });

    it('shows error for invalid email', async () => {
        const user = userEvent.setup();
        render(<Newsletter />);
        const input = screen.getByPlaceholderText(/enter your email/i);
        await user.type(input, 'invalid');
        await user.click(screen.getByRole('button', { name: /subscribe/i }));
        expect(mockSubscribe).not.toHaveBeenCalled();
    });

    it('calls subscribe on valid email', async () => {
        mockSubscribe.mockResolvedValueOnce({ message: 'Subscribed!' });
        const user = userEvent.setup();
        render(<Newsletter />);
        const input = screen.getByPlaceholderText(/enter your email/i);
        await user.type(input, 'test@example.com');
        await user.click(screen.getByRole('button', { name: /subscribe/i }));
        expect(mockSubscribe).toHaveBeenCalledWith('test@example.com');
    });

    it('shows success message after subscribe', async () => {
        mockSubscribe.mockResolvedValueOnce({ message: 'Subscribed!' });
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText(/enter your email/i), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /subscribe/i }));
        expect(await screen.findByText(/you're subscribed/i)).toBeInTheDocument();
    });

    it('shows error on subscribe failure', async () => {
        mockSubscribe.mockRejectedValueOnce(new Error('Already subscribed'));
        const user = userEvent.setup();
        render(<Newsletter />);
        await user.type(screen.getByPlaceholderText(/enter your email/i), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /subscribe/i }));
        expect(await screen.findByText(/already subscribed/i)).toBeInTheDocument();
    });
});
