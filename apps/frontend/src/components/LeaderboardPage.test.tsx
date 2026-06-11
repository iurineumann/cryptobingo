// LeaderboardPage.test.tsx — ranking público. Ref: ADR-024.
// Cobre: loading, dados renderizados, erro + retry, estado vazio, troncamento de wallet.

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';

vi.mock('react-i18next', () => {
    const t = (k: string, opts?: Record<string, unknown>) =>
        opts ? `${k}:${JSON.stringify(opts)}` : k;
    return { useTranslation: () => ({ t }) };
});

vi.mock('../services/api', () => ({
    fetchLeaderboard:     vi.fn(),
    fetchRoomLeaderboard: vi.fn(),
}));

// Imports APÓS os mocks (vitest hoisting garante a ordem correta)
import LeaderboardPage from './LeaderboardPage';
import { fetchLeaderboard, fetchRoomLeaderboard } from '../services/api';

const mockFetch     = vi.mocked(fetchLeaderboard);
const mockFetchRoom = vi.mocked(fetchRoomLeaderboard);

const ENTRIES = [
    { rank: 1, wallet: 'alice.wam',        nickname: 'Alice', total_won: 500, currency: 'WAX', games_won: 5 },
    { rank: 2, wallet: 'bob1234567890.wam', nickname: null,    total_won: 300, currency: 'WAX', games_won: 3 },
];

describe('LeaderboardPage — global', () => {
    beforeEach(() => vi.resetAllMocks());

    it('mostra spinner durante loading', () => {
        mockFetch.mockReturnValue(new Promise(() => {}));
        render(<LeaderboardPage />);

        expect(screen.getByTestId('leaderboard-loading')).toBeInTheDocument();
    });

    it('renderiza tabela com entradas após fetch bem-sucedido', async () => {
        mockFetch.mockResolvedValue({ entries: ENTRIES, cached_at: '2026-01-01T12:00:00Z', currency_filter: null } as any);

        render(<LeaderboardPage />);

        await waitFor(() => {
            expect(screen.getByTestId('leaderboard-table')).toBeInTheDocument();
            expect(screen.getByTestId('leaderboard-row-1')).toBeInTheDocument();
            expect(screen.getByTestId('leaderboard-nickname-1')).toHaveTextContent('Alice');
            expect(screen.getByTestId('leaderboard-total-1')).toHaveTextContent('500');
            // Bob sem nickname → wallet truncada (>12 chars → mostra início…fim)
            expect(screen.getByTestId('leaderboard-nickname-2')).toHaveTextContent('bob123');
        });
    });

    it('mostra erro e botão retry em caso de falha', async () => {
        mockFetch
            .mockRejectedValueOnce(new Error('Falha de rede'))
            .mockResolvedValueOnce({ entries: ENTRIES, cached_at: '2026-01-01T12:00:00Z', currency_filter: null } as any);

        render(<LeaderboardPage />);

        await waitFor(() => {
            expect(screen.getByTestId('leaderboard-error')).toHaveTextContent('Falha de rede');
            expect(screen.getByTestId('leaderboard-retry')).toBeInTheDocument();
        });

        await act(async () => { fireEvent.click(screen.getByTestId('leaderboard-retry')); });
        await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeInTheDocument());
    });

    it('mostra estado vazio quando lista está vazia', async () => {
        mockFetch.mockResolvedValue({ entries: [], cached_at: '2026-01-01T12:00:00Z', currency_filter: null } as any);

        render(<LeaderboardPage />);

        await waitFor(() => expect(screen.getByTestId('leaderboard-empty')).toBeInTheDocument());
        expect(screen.queryByTestId('leaderboard-table')).not.toBeInTheDocument();
    });

    it('exibe timestamp de atualização (cached_at)', async () => {
        mockFetch.mockResolvedValue({ entries: ENTRIES, cached_at: '2026-01-01T12:00:00Z', currency_filter: null } as any);

        render(<LeaderboardPage />);

        await waitFor(() => {
            expect(screen.queryByTestId('leaderboard-loading')).not.toBeInTheDocument();
            expect(screen.getByText(/leaderboard\.updated_at/)).toBeInTheDocument();
        });
    });
});

describe('LeaderboardPage — por sala (roomId prop)', () => {
    beforeEach(() => vi.resetAllMocks());

    it('usa fetchRoomLeaderboard com o roomId correto', async () => {
        mockFetchRoom.mockResolvedValue({ room_id: '7', entries: ENTRIES, cached_at: '2026-01-01T12:00:00Z' } as any);

        render(<LeaderboardPage roomId="7" />);

        await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeInTheDocument());
        expect(mockFetchRoom).toHaveBeenCalledWith('7', 20);
        expect(mockFetch).not.toHaveBeenCalled();
    });
});
