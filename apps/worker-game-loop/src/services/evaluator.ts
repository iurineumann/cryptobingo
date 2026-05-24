import { fetchGame, fetchPlayerTickets } from '@cryptobingo/blockchain-core';
import { executeClaimWin } from './blockchain'; // Atualizaremos o blockchain.ts depois para exportar isso

/**
 * Compara a cartela do jogador com as bolas sorteadas para verificar o "Bingo".
 * A regra padrão aqui é "Full House" (Cartela Cheia).
 */
export function isWinningTicket(drawnBalls: number[], ticketNumbers: number[]): boolean {
    // Se a cartela estiver vazia ou tiver mais números que os sorteados, é impossível ganhar
    if (ticketNumbers.length === 0 || ticketNumbers.length > drawnBalls.length) {
        return false;
    }

    // O método .every garante que TODOS os números da cartela estejam no array de bolas sorteadas.
    // Usamos um Set para drawnBalls internamente se a lista for gigante, 
    // mas para um Bingo padrão de 75 bolas, o .includes é extremamente performático.
    return ticketNumbers.every(num => drawnBalls.includes(num));
}

/**
 * O motor de varredura: Lê a blockchain e processa os vencedores
 */
export async function processGameWinners(gameId: string, playerWallet: string) {
    console.log(`\n🧠 [Avaliador] Iniciando auditoria do jogo ${gameId} para o jogador ${playerWallet}...`);

    try {
        // 1. Busca o estado oficial do jogo na blockchain
        const game = await fetchGame(gameId);
        
        if (!game) {
            throw new Error(`Jogo ${gameId} não encontrado no contrato.`);
        }

        if (game.status !== 'drawn') {
            console.log(`⚠️ [Avaliador] O jogo ${gameId} ainda não foi sorteado. Status: ${game.status}`);
            return;
        }

        // 2. Busca todas as cartelas compradas por este jogador
        const tickets = await fetchPlayerTickets(gameId, playerWallet);
        
        if (tickets.length === 0) {
            console.log(`ℹ️ [Avaliador] O jogador ${playerWallet} não tem cartelas neste jogo.`);
            return;
        }

        // 3. Varre as cartelas em busca do padrão vencedor
        const winningTickets = tickets.filter(ticket => 
            isWinningTicket(game.drawn_balls, ticket.numbers)
        );

        // 4. Se houver vitória, aciona o braço da blockchain para liquidar o prêmio
        if (winningTickets.length > 0) {
            console.log(`🎉 [Avaliador] BINGO! O jogador ${playerWallet} tem ${winningTickets.length} cartela(s) premiada(s)!`);
            
            // Para cada cartela vitoriosa, chamamos o contrato inteligente para liberar os fundos
            for (const ticket of winningTickets) {
                await executeClaimWin(gameId, ticket.ticket_id);
                console.log(`💸 [Avaliador] Pagamento pendente para a cartela #${ticket.ticket_id}`);
            }
        } else {
            console.log(`😔 [Avaliador] Nenhuma cartela premiada para ${playerWallet} neste jogo.`);
        }

    } catch (error) {
        console.error(`❌ [Avaliador] Erro crítico ao avaliar o jogo ${gameId}:`, error);
        throw error;
    }
}