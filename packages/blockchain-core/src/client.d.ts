import { APIClient } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord, BlockchainBalance } from '@cryptobingo/shared-types';
export declare const rpcClient: APIClient;
export declare function fetchGame(gameId: string): Promise<BlockchainGameState | null>;
export declare function fetchPlayerTickets(gameId: string, playerWallet: string): Promise<BlockchainTicketRecord[]>;
export declare function fetchPlayerBalance(playerWallet: string): Promise<BlockchainBalance | null>;
//# sourceMappingURL=client.d.ts.map