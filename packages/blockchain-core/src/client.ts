import { APIClient, Name, UInt64 } from '@wharfkit/antelope';
import type { 
    BlockchainGameState, 
    BlockchainTicketRecord, 
    BlockchainBalance 
} from '@cryptobingo/shared-types';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
const CONTRACT_ACCOUNT = process.env.CONTRACT_ACCOUNT || 'bingogamectr';

// ── Multi-RPC fallback ────────────────────────────────────

const RPC_URLS_RAW = process.env.RPC_URLS || '';
const EXTRA_URLS = RPC_URLS_RAW
    .split(',')
    .map(s => s.trim())
    .filter(s => s.length > 0 && s !== RPC_URL);

export const RPC_ENDPOINTS = [RPC_URL, ...EXTRA_URLS].map(url => new APIClient({ url }));

// rpcClient mantido como alias do primeiro endpoint (compatibilidade retroativa)
export const rpcClient = RPC_ENDPOINTS[0];

// ── Cache para fetchGame ──────────────────────────────────

interface CacheEntry {
    state: BlockchainGameState;
    ts: number;
}

const gameCache = new Map<string, CacheEntry>();

const FETCH_GAME_CACHE_TTL_MS = Number.parseInt(
    process.env.FETCH_GAME_CACHE_TTL_MS ?? '2000', 10
);

export function invalidateGameCache(gameId: string): void {
    gameCache.delete(gameId);
}

export function clearGameCache(): void {
    gameCache.clear();
}

/**
 * Converte uma hex string da ABI (tipo `bytes`) para um array de números.
 * O contrato serializa `vector<uint8_t>` / `std::vector<char>` como hex na ABI.
 */
export function parseHexBytes(hex: string): number[] {
    const out: number[] = [];
    for (let i = 0; i < hex.length; i += 2) {
        out.push(parseInt(hex.substring(i, i + 2), 16));
    }
    return out;
}

/**
 * Busca o estado de um jogo na tabela `games` (scope: bingogamectr).
 * Retorna null se o jogo não existir.
 *
 * Usa múltiplos endpoints RPC com fallback automático.
 * Cache com TTL configurável (default 2s) evita martelar o RPC.
 *
 * IMPORTANTE: `drawn_balls` vem como hex string (`bytes` na ABI) e é convertida
 * automaticamente para `number[]`.
 */
export async function fetchGame(gameId: string): Promise<BlockchainGameState | null> {
    const cached = gameCache.get(gameId);
    if (cached && Date.now() - cached.ts < FETCH_GAME_CACHE_TTL_MS) {
        return { ...cached.state };
    }

    const gameIdU64 = UInt64.from(gameId);
    let lastError: Error | null = null;

    for (const endpoint of RPC_ENDPOINTS) {
        try {
            const response = await endpoint.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT,
                scope: CONTRACT_ACCOUNT,
                table: 'games',
                lower_bound: gameIdU64,
                upper_bound: gameIdU64,
                limit: 1,
                json: true,
            });

            if (response.rows.length === 0) return null;
            const row = response.rows[0] as Record<string, any>;
            if (typeof row.drawn_balls === 'string') {
                row.drawn_balls = parseHexBytes(row.drawn_balls);
            }
            const state = row as unknown as BlockchainGameState;

            gameCache.set(gameId, { state, ts: Date.now() });
            return state;
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err));
        }
    }

    throw lastError || new Error(`fetchGame(${gameId}): todos os endpoints falharam`);
}

/**
 * Busca todas as cartelas de um jogador em um jogo via índice secundário `owner`.
 *
 * O scope da tabela `tickets` é o game_id (uint64).
 * O índice secundário é o cast uint64 do `name` do owner (Name.value).
 *
 * IMPORTANTE: Retorna BlockchainTicketRecord[] com os campos reais do contrato:
 *   { ticket_id, owner, matrix, state, game_id }
 *   `matrix` vem como hex string (`bytes` na ABI) e é convertida para `number[]`.
 */
export async function fetchPlayerTickets(gameId: string, playerWallet: string): Promise<BlockchainTicketRecord[]> {
    const ownerU64 = Name.from(playerWallet).value;
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: Name.from(UInt64.from(gameId)),
        table: 'tickets',
        index_position: 'secondary',
        key_type: 'i64',
        lower_bound: ownerU64,
        upper_bound: ownerU64,
        json: true,
    });

    const rows = response.rows as Record<string, any>[];
    for (const row of rows) {
        if (typeof row.matrix === 'string') {
            row.matrix = parseHexBytes(row.matrix);
        }
    }
    return rows as unknown as BlockchainTicketRecord[];
}

/**
 * Busca o saldo de um token específico na tabela `balances`.
 *
 * O scope da tabela `balances` é o account_name do usuário.
 * A primary key é o symbol_code.raw() do token.
 * Para buscar todos os tokens do usuário, omitimos lower/upper bound.
 *
 * Retorna null se o usuário não tiver nenhum saldo registrado.
 */
export async function fetchPlayerBalance(playerWallet: string): Promise<BlockchainBalance[]> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: playerWallet,
        table: 'balances',
        json: true,
        limit: 20, // Um usuário raramente terá mais de 20 tokens diferentes
    });

    return response.rows as BlockchainBalance[];
}