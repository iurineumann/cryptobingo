// Testes de Lobby — Issue #268: dados via fetchLobby/fetchLobbyMe.
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

// Dados mutáveis compartilhados entre mock factory e testes
const mockLobbyData = vi.hoisted(() => ({ games: [] as any[], rooms: [] as any[], gametypes: [] as any[] }));
const mockLobbyMeData = vi.hoisted(() => ({ balances: [] as any[], myTickets: {} as Record<string, number>, playerRoomIds: [] as string[] }));

vi.mock('../services/api', () => ({
    fetchLobby:  vi.fn().mockImplementation(() => Promise.resolve(mockLobbyData)),
    fetchLobbyMe: vi.fn().mockImplementation(() => Promise.resolve(mockLobbyMeData)),
    fetchRooms:  vi.fn(),
    fetchPublicGametypeMetadata: vi.fn().mockResolvedValue({ combinations: [], rules: [], stages: [] }),
}));

function buildSession(): Session {
    return { actor: 'player1' } as unknown as Session;
}

function gametype(id: string, base_multiplier: number, rules: any[]) {
    return { gametype_id: id, name: `GT ${id}`, base_multiplier, rules, draw_mode: 'standard', max_balls: 0, golden_ball_after: 0, master_weight_ovrd: 0, stages: [] };
}

function game(game_id: string, room_id: string, status: string) {
    return {
        game_id, room_id, status,
        ticket_price: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        total_wagered: { quantity: '100.0000 WAX', contract: 'eosio.token' },
        drawn_balls: [], gametype_id: '1', end_time: 0,
        campaign_id: '0', sponsor_pool: [], golden_ball_num: 0, golden_multiplier: 0, total_paid: 0,
    };
}

function room(id: string, overrides: any = {}) {
    return {
        room_id: id, gametype_id: '1', sponsor: '',
        currency: { quantity: '1.0000 WAX', contract: 'eosio.token' },
        ticket_price_min: { quantity: '1.0000 WAX', contract: 'eosio.token' },
        ticket_price_max: { quantity: '10.0000 WAX', contract: 'eosio.token' },
        ticket_price_default: { quantity: '5.0000 WAX', contract: 'eosio.token' },
        weight: '100', max_tickets_per_player: 10, current_game_id: '0',
        nft_template_allowlist: [], sponsor_room: false, status: 'active',
        created_at: Date.now() - 10000, paused_at: 0,
        metadata: { name: 'Sala Teste', room_id: id, description: '', cover_image_url: '', rules_summary: '', chat_enabled: true, auto_start_delay_sec: 60, drops: [] },
        ...overrides,
    };
}

function balance(quantity: string) {
    return { balance: { quantity, contract: 'eosio.token' } };
}

describe('Lobby — room name display', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLobbyData.games = [];
        mockLobbyData.rooms = [];
        mockLobbyData.gametypes = [];
        mockLobbyMeData.balances = [];
        mockLobbyMeData.myTickets = {};
        mockLobbyMeData.playerRoomIds = [];
    });

    it('[A2] renderiza nome da sala quando metadata existe', async () => {
        mockLobbyData.rooms.push(room('1'));
        mockLobbyData.games.push(game('100', '1', 'funding'));
        mockLobbyData.gametypes.push(gametype('1', 100, [{ weight: 500 }]));

        render(<Lobby session={buildSession()} />);

        await waitFor(() => {
            expect(screen.getByText('Sala Teste')).toBeTruthy();
        });
    });

    it('[A2] renderiza fallback #ID quando metadata.name ausente', async () => {
        mockLobbyData.rooms.push(room('2', { metadata: null }));
        mockLobbyData.games.push(game('101', '2', 'funding'));
        mockLobbyData.gametypes.push(gametype('1', 100, [{ weight: 500 }]));

        render(<Lobby session={buildSession()} />);

        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-2');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('lobby.room_label');
        });
    });

    it('[A2] fallback inclui o room_id', async () => {
        mockLobbyData.rooms.push(room('7', { metadata: null }));
        mockLobbyData.games.push(game('107', '7', 'funding'));
        mockLobbyData.gametypes.push(gametype('1', 100, [{ weight: 500 }]));

        render(<Lobby session={buildSession()} />);

        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-7');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('#7');
        });
    });
});

describe('Lobby — maxPrizeVal', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLobbyData.games = [];
        mockLobbyData.rooms = [];
        mockLobbyData.gametypes = [];
        mockLobbyMeData.balances = [];
        mockLobbyMeData.myTickets = {};
        mockLobbyMeData.playerRoomIds = [];
    });

    it('[A3] exibe valor de premio maximo', async () => {
        mockLobbyData.rooms.push(room('10'));
        mockLobbyData.games.push(game('110', '10', 'funding'));
        mockLobbyData.gametypes.push(gametype('1', 100, [{ weight: 500 }]));

        render(<Lobby session={buildSession()} />);

        await waitFor(() => {
            const card = screen.getByTestId('lobby-card-10');
            expect(card).toBeTruthy();
            expect(card.textContent).toContain('5000');
        });
    });
});

describe('Lobby — balances', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockLobbyData.games = [];
        mockLobbyData.rooms = [];
        mockLobbyData.gametypes = [];
        mockLobbyMeData.balances = [];
        mockLobbyMeData.myTickets = {};
        mockLobbyMeData.playerRoomIds = [];
    });

    it('[REG] exibe saldo quando fetchLobbyMe retorna balances', async () => {
        mockLobbyMeData.balances.push(balance('250.0000 WAX'));
        mockLobbyData.rooms.push(room('1'));
        mockLobbyData.games.push(game('100', '1', 'funding'));
        mockLobbyData.gametypes.push(gametype('1', 100, [{ weight: 500 }]));

        render(<Lobby session={buildSession()} />);

        await waitFor(() => {
            expect(screen.getByText('250.0000 WAX')).toBeTruthy();
        });
    });
});
