// Exporta o cliente base caso algum serviço precise fazer queries avançadas não mapeadas
export { rpcClient } from './client';

// Exporta as funções fortemente tipadas
export { 
    fetchGame, 
    fetchPlayerTickets, 
    fetchPlayerBalance 
} from './client';