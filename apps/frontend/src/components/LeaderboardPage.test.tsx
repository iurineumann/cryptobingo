// Testes de LeaderboardPage (ADR-024).
// Cobre: render inicial, tabs winnings/xp, dados carregados, estado vazio, erro, retry.

import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import LeaderboardPage from './LeaderboardPage';

vi.mock('../services/api', () => ({
    fetchLeaderboard:     vi.fn(),
    fetchLeaderboardXp:   vi.fn(),
    fetchRoomLeaderboard: vi.fn(),
}));

vi.mock('react-i18next', () => {
    const t = (k: string, opts?: any) => opts?.time ? `Atualizado às ${opts.time}` : k;
    return { useTranslation: () => ({ t }) };
});

import { fetchLeaderboard, fetchLeaderboardXp, fetchRoomLeaderboard }
    from '../services/api';

const mockLeaderboard    = fetchLeaderboard     as ReturnType<typeof vi.fn>;
const mockLeaderboardXp  = fetchLeaderboardXp   as ReturnType<typeof vi.fn>;
const mockRoomLeaderboard = fetchRoomLeaderboard as ReturnType<typeof vi.fn>;

const GLOBAL_RESPONSE = {
    entries: [
        { rank: 1, wallet: 'alice.wam', nickname: 'Alice', total_won: 150.5, currency: 'WAX', games_won: 5 },
        { rank: 2, wallet: 'bob.wam',   nickname: null,    total_won: 80.0,  currency: 'WAX', games_won: 2 },
    ],
    cached_at:       '2026-01-01T12:00:00Z',
    currency_filter: null,
};

const XP_RESPONSE = {
    entries: [
        { rank: 1, wallet: 'carol.wam', nickname: 'Carol', xp: 5000, tier: 'Ouro', level: 10, games_played: 20 },
    ],
    cached_at: '2026-01-01T12:00:00Z',
};

beforeEach(() => {
    vi.clearAllMocks();
    mockLeaderboard.mockResolvedValue(GLOBAL_RESPONSE);
    mockLeaderboardXp.mockResolvedValue(XP_RESPONSE);
    mockRoomLeaderboard.mockResolvedValue({ room_id: '1', entries: [], cached_at: '' });
});

describe('LeaderboardPage — render e estado inicial', () => {
    it('[REG] renderiza página com data-testid correto', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => expect(screen.getByTestId('leaderboard-page')).toBeDefined());
    });

    it('[REG] mostra spinner enquanto carrega', () => {
        mockLeaderboard.mockImplementation(() => new Promise(() => {})); // nunca resolve
        render(<LeaderboardPage />);
        expect(screen.getByTestId('leaderboard-loading')).toBeDefined();
    });

    it('[REG] esconde spinner após carregar', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => expect(screen.queryByTestId('leaderboard-loading')).toBeNull());
    });
});

describe('LeaderboardPage — tab winnings', () => {
    it('[REG] exibe tabela com entries após carregar', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeDefined());
    });

    it('[REG] linha 1 mostra nickname "Alice"', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => {
            expect(screen.getByTestId('leaderboard-nickname-1').textContent).toBe('Alice');
        });
    });

    it('[REG] linha 2 trunca wallet quando sem nickname', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => {
            // bob.wam tem 7 chars — não truncado
            expect(screen.getByTestId('leaderboard-nickname-2').textContent).toContain('bob.wam');
        });
    });

    it('[REG] exibe total_won com currency', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => {
            const cell = screen.getByTestId('leaderboard-total-1');
            expect(cell.textContent).toContain('WAX');
        });
    });

    it('[REG] estado vazio: mostra mensagem leaderboard.empty', async () => {
        mockLeaderboard.mockResolvedValue({ entries: [], cached_at: '', currency_filter: null });
        render(<LeaderboardPage />);
        await waitFor(() => expect(screen.getByTestId('leaderboard-empty')).toBeDefined());
    });
});

describe('LeaderboardPage — tab XP', () => {
    it('[REG] clique na tab XP carrega ranking XP', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => screen.getByTestId('leaderboard-tab-xp'));

        fireEvent.click(screen.getByTestId('leaderboard-tab-xp'));

        await waitFor(() => {
            expect(mockLeaderboardXp).toHaveBeenCalled();
            expect(screen.getByTestId('leaderboard-xp-1')).toBeDefined();
        });
    });

    it('[REG] tab XP mostra XP de Carol', async () => {
        render(<LeaderboardPage />);
        await waitFor(() => screen.getByTestId('leaderboard-tab-xp'));
        fireEvent.click(screen.getByTestId('leaderboard-tab-xp'));

        await waitFor(() => {
            expect(screen.getByTestId('leaderboard-xp-1').textContent).toContain('5');
        });
    });
});

describe('LeaderboardPage — por sala', () => {
    it('[REG] com roomId não renderiza tabs', async () => {
        mockRoomLeaderboard.mockResolvedValue({
            room_id: '42', entries: [
                { rank: 1, wallet: 'x.wam', nickname: 'X', total_won: 10, currency: 'WAX', games_won: 1, room_id: '42' },
            ], cached_at: '',
        });
        render(<LeaderboardPage roomId="42" />);
        await waitFor(() => expect(screen.queryByTestId('leaderboard-tab-winnings')).toBeNull());
        await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeDefined());
    });
});

describe('LeaderboardPage — erro', () => {
    it('[REG] mostra erro e botão retry', async () => {
        mockLeaderboard.mockRejectedValue(new Error('Servidor fora'));
        render(<LeaderboardPage />);
        await waitFor(() => expect(screen.getByTestId('leaderboard-error')).toBeDefined());
        expect(screen.getByTestId('leaderboard-retry')).toBeDefined();
    });

    it('[REG] retry recarrega dados', async () => {
        mockLeaderboard
            .mockRejectedValueOnce(new Error('Falha'))
            .mockResolvedValueOnce(GLOBAL_RESPONSE);

        render(<LeaderboardPage />);
        await waitFor(() => screen.getByTestId('leaderboard-retry'));

        fireEvent.click(screen.getByTestId('leaderboard-retry'));

        await waitFor(() => expect(screen.getByTestId('leaderboard-table')).toBeDefined());
    });
});
