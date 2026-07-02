import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import VoteModal from './VoteModal';

const mockRequestVote = vi.fn();
const mockConfirmVote = vi.fn();

vi.mock('@/lib/api', () => ({
    requestVote: (...args: unknown[]) => mockRequestVote(...args),
    confirmVote: (...args: unknown[]) => mockConfirmVote(...args),
}));

describe('VoteModal', () => {
    const onClose = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('renders nothing when closed', () => {
        const { container } = render(
            <VoteModal isOpen={false} ideaId={1} onClose={onClose} />
        );
        expect(container.innerHTML).toBe('');
    });

    it('renders email step when open', () => {
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        expect(screen.getByText(/vote on this idea/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText('your@email.com')).toBeInTheDocument();
    });

    it('shows vote type toggle on first step', () => {
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        expect(screen.getByRole('button', { name: /upvote/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /downvote/i })).toBeInTheDocument();
    });

    it('shows error on vote request failure', async () => {
        mockRequestVote.mockRejectedValueOnce(new Error('Already voted'));
        const user = userEvent.setup();
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /send code/i }));
        expect(await screen.findByText(/already voted/i)).toBeInTheDocument();
    });

    it('moves to code step after successful email submission', async () => {
        mockRequestVote.mockResolvedValueOnce({ message: 'Code sent', code_expires_at: '...' });
        const user = userEvent.setup();
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /send code/i }));
        expect(await screen.findByText(/confirm your vote/i)).toBeInTheDocument();
    });

    it('shows confirmed step after code verification', async () => {
        mockRequestVote.mockResolvedValueOnce({ message: 'Code sent' });
        mockConfirmVote.mockResolvedValueOnce({ message: 'Vote confirmed!' });
        const user = userEvent.setup();
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /send code/i }));
        await screen.findByText(/confirm your vote/i);
        const codeInput = screen.getByPlaceholderText('000000');
        await user.type(codeInput, '123456');
        await user.click(screen.getByRole('button', { name: /confirm vote/i }));
        expect(await screen.findByText(/vote confirmed/i)).toBeInTheDocument();
    });

    it('calls onClose when closed after confirmation', async () => {
        mockRequestVote.mockResolvedValueOnce({ message: 'Code sent' });
        mockConfirmVote.mockResolvedValueOnce({ message: 'Vote confirmed!' });
        const user = userEvent.setup();
        render(<VoteModal isOpen={true} ideaId={1} onClose={onClose} />);
        await user.type(screen.getByPlaceholderText('your@email.com'), 'test@example.com');
        await user.click(screen.getByRole('button', { name: /send code/i }));
        await screen.findByText(/confirm your vote/i);
        await user.type(screen.getByPlaceholderText('000000'), '123456');
        await user.click(screen.getByRole('button', { name: /confirm vote/i }));
        await screen.findByText(/vote confirmed/i);
        await user.click(screen.getByText('Close'));
        expect(onClose).toHaveBeenCalled();
    });
});
