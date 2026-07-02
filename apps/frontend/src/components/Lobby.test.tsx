// Testes de Lobby — hotfix POLL intervals, room name display, maxPrizeVal.
import { render, screen, waitFor } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import type { Session } from '@wharfkit/session';
import Lobby from './Lobby';

vi.mock('react-i18next', () => ({
    useTranslation: () => ({
        t: (key: string) => key,
        i18n: { language: 'pt-BR', changeLanguage: vi.fn() },
    }),
}));

const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
    useNavigate: () => mockNavigate,
}));

// API mock — retorna sala configurável
const mockRooms: any[] = [];
vi.mock('../services/api', () => ({
    fetchRooms: vi.fn().mockImplementation(() => Promise.resolve({ rooms: mockRooms })),
    fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [], stages: [] }),
}));

// Helpers para montar session com dados controlados
function buildSession(games: any[] = [], gametypes: any[] = [], tickets: any[] = []): Session {
    const get_table_rows = vi.fn(async ({ table, code, scope }: any) => {
        if (table === 'balances') return { rows: [], more: false };
        if (table === 'games') return { rows: games, more: false };
        if (table === 'gametypes') return { rows: gametypes, more: false };
        if (table === 'tickets') return { rows: tickets, more: false };
        return { rows: [], more: false };
    });
    return { actor: 'player1', client: { v1: { chain: { get_table_rows } } } } as unknown as Session;
}

function gametype(id: string, base_multiplier: number, rules: any[]) {
    return { gametype_id: id, base_multiplier, rules, combinations: [] };
}

function game(game_id: string, room_id: string, status: string) {
    return {
        game_id,
        room_id,
        status,
        ticket_price: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
        drawn_balls: [],
        gametype_id: '1',
        end_time: 0,
    };
}

function room(id: string, overrides: any = {}) {
    return {
        room_id: id,
        gametype_id: '1',
        sponsor: '',
        currency: { quantity: '1.0000 WAX', contract: 'eosio.token' },
        ticket_price_min: { quantity: '1.0000 WAX', contract: 'eosio.token' },
        ticket_price_max: { quantity: '10.0000 WAX', contract: 'eosio.token' },
        ticket_price_default: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        weight: '100',
        max_tickets_per_player: 10,
        current_game_id: '0',
        nft_template_allowlist: [],
        sponsor_room: false,
        status: 'active',
        created_at: Date.now() - 10000,
        metadata: { name: 'Sala Teste', room_id: id, description: '', cover_image_url: '', rules_summary: '', chat_enabled: true, auto_start_delay_sec: 60, drops: [] },
        ...overrides,
    };
}



describe('Lobby — hotfix A2: room name display', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRooms.length = 0;
    });

    it('[A2] renderiza nome da sala quando metadata existe', async () => {
        mockRooms.push(room('1'));
        const session = buildSession(
            [game('100', '1', 'funding')],
            [gametype('1', 100, [{ weight: 500 }])],
        );

        render(<Lobby session={session} />);

        await waitFor(() => {
            expect(screen.getByText('Sala Teste')).toBeTruthy();
        });
    });

    it('[A2] renderiza fallback #ID quando metadata.name ausente', async () => {
        mockRooms.push(room('2', { metadata: null }));
        const session = buildSession(
            [game('101', '2', 'funding')],
            [gametype('1', 100, [{ weight: 500 }])],
        );

        render(<Lobby session={session} />);

        // Deve mostrar o fallback "lobby.room_label #2"
        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-2');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('lobby.room_label');
        });
    });

    it('[A2] fallback inclui o room_id', async () => {
        mockRooms.push(room('7', { metadata: null }));
        const session = buildSession(
            [game('107', '7', 'funding')],
            [gametype('1', 100, [{ weight: 500 }])],
        );

        render(<Lobby session={session} />);

        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-7');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('#7');
        });
    });
});

describe('Lobby — hotfix A3: maxPrizeVal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRooms.length = 0;
    });

    it('[A3] exibe valor de prêmio máximo (usando ticket_price_max)', async () => {
        // maxPrizeVal = 10 * 100 * 500 / 100 = 5000 (com ticket_price_max)
        mockRooms.push(room('10'));
        const session = buildSession(
            [game('110', '10', 'funding')],
            [gametype('1', 100, [{ weight: 500 }])],
        );

        render(<Lobby session={session} />);

        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-10');
            expect(card).toBeTruthy();
            // maxPrizeVal usa ticket_price_max (10) agora
            expect(card.textContent).toContain('5000');
        });
    });
});
