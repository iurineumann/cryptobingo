import { APIClient, Name, UInt64 } from '@wharfkit/antelope';
import type { 
    BlockchainGameState, 
    BlockchainTicketRecord, 
    BlockchainBalance 
} from '@cryptobingo/shared-types';

const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8888';
const CONTRACT_ACCOUNT = 'bingo.game';

export const rpcClient = new APIClient({ url: RPC_URL });

export async function fetchGame(gameId: string): Promise<BlockchainGameState | null> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'games',
        // CORREÇÃO: Convertendo string para UInt64 da rede Antelope
        lower_bound: UInt64.from(gameId),
        upper_bound: UInt64.from(gameId),
        limit: 1,
        json: true,
    });

    if (response.rows.length === 0) return null;
    return response.rows[0] as BlockchainGameState;
}

export async function fetchPlayerTickets(gameId: string, playerWallet: string): Promise<BlockchainTicketRecord[]> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: gameId,
        table: 'tickets',
        index_position: 'secondary',
        key_type: 'i64',
        // CORREÇÃO: Convertendo a carteira do jogador para o tipo Name
        lower_bound: Name.from(playerWallet).value,
        upper_bound: Name.from(playerWallet).value,
        json: true,
    });

    return response.rows as BlockchainTicketRecord[];
}

export async function fetchPlayerBalance(playerWallet: string): Promise<BlockchainBalance | null> {
    const response = await rpcClient.v1.chain.get_table_rows({
        code: CONTRACT_ACCOUNT,
        scope: CONTRACT_ACCOUNT,
        table: 'balances',
        // CORREÇÃO: Convertendo a carteira do jogador para o tipo Name
        lower_bound: Name.from(playerWallet),
        upper_bound: Name.from(playerWallet),
        limit: 1,
        json: true,
    });

    if (response.rows.length === 0) return null;
    return response.rows[0] as BlockchainBalance;
}