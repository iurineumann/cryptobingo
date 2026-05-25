// Exporta o cliente base caso algum serviço precise fazer queries avançadas não mapeadas
export { rpcClient } from './client';

// Exporta as funções fortemente tipadas
export { 
    fetchGame, 
    fetchPlayerTickets, 
    fetchPlayerBalance 
} from './client';

// Re-exporta os tipos on-chain para conveniência dos consumers
export type {
    BlockchainGameState,
    BlockchainTicketRecord,
    BlockchainBalance,
    ExtendedAsset,
    GameStatus
} from '@cryptobingo/shared-types';