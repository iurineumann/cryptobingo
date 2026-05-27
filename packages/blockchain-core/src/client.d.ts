import { APIClient } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord, BlockchainBalance } from '@cryptobingo/shared-types';
export declare const rpcClient: APIClient;
/**
 * Busca o estado de um jogo na tabela `games` (scope: bingo.game).
 * Retorna null se o jogo não existir.
 */
export declare function fetchGame(gameId: string): Promise<BlockchainGameState | null>;
/**
 * Busca todas as cartelas de um jogador em um jogo via índice secundário `owner`.
 *
 * O scope da tabela `tickets` é o game_id (uint64).
 * O índice secundário é o cast uint64 do `name` do owner (Name.value).
 *
 * IMPORTANTE: Retorna BlockchainTicketRecord[] com os campos reais do contrato:
 *   { ticket_id, owner, matrix, state, game_id }
 */
export declare function fetchPlayerTickets(gameId: string, playerWallet: string): Promise<BlockchainTicketRecord[]>;
/**
 * Busca o saldo de um token específico na tabela `balances`.
 *
 * O scope da tabela `balances` é o account_name do usuário.
 * A primary key é o symbol_code.raw() do token.
 * Para buscar todos os tokens do usuário, omitimos lower/upper bound.
 *
 * Retorna null se o usuário não tiver nenhum saldo registrado.
 */
export declare function fetchPlayerBalance(playerWallet: string): Promise<BlockchainBalance[]>;
//# sourceMappingURL=client.d.ts.map