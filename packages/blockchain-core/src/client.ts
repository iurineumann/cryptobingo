import { APIClient } from '@wharfkit/antelope';
import type { 
    BlockchainGameState, 
    BlockchainTicketRecord, 
    BlockchainBalance 
} from '@cryptobingo/shared-types';

// Otimização: Reutiliza a URL do ambiente ou cai para o nó local do desenvolvedor
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
const CONTRACT_ACCOUNT = 'bingo.game';

// Instância Singleton do cliente Wharfkit
export const rpcClient = new APIClient({ url: RPC_URL });

/**
 * Busca o estado atual de um jogo específico
 */
export async function fetchGame(gameId: string): Promise<BlockchainGameState | null> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'games',
        lower_bound: gameId,
        upper_bound: gameId,
        limit: 1,
        json: true,
    });

    if (response.rows.length === 0) return null;
    return response.rows[0] as BlockchainGameState;
}

/**
 * Busca todas as cartelas compradas por um jogador em um jogo específico
 */
export async function fetchPlayerTickets(gameId: string, playerWallet: string): Promise<BlockchainTicketRecord[]> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: gameId,              // O escopo da tabela tickets é o game_id
        table: 'tickets',
        index_position: 'secondary', // Assumindo que criamos um índice secundário pelo comprador
        key_type: 'i64',
        lower_bound: playerWallet,
        upper_bound: playerWallet,
        json: true,
    });

    return response.rows as BlockchainTicketRecord[];
}

/**
 * Retorna o saldo em custódia no contrato de um jogador
 */
export async function fetchPlayerBalance(playerWallet: string): Promise<BlockchainBalance | null> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'balances',
        lower_bound: playerWallet,
        upper_bound: playerWallet,
        limit: 1,
        json: true,
    });

    if (response.rows.length === 0) return null;
    return response.rows[0] as BlockchainBalance;
}