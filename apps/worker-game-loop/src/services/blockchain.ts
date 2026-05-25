import { Session } from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import { rpcClient } from '@cryptobingo/blockchain-core';
import dotenv from 'dotenv';

dotenv.config();

const privateKey = process.env.MICROSERVICE_PRIVATE_KEY;
const chainId = process.env.CHAIN_ID;
const contractAccount = process.env.CONTRACT_ACCOUNT || 'bingo.game';
const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8888'; // Nova variável extraída diretamente do .env

if (!privateKey || !chainId) {
    throw new Error('❌ Faltam variáveis de ambiente críticas (MICROSERVICE_PRIVATE_KEY ou CHAIN_ID).');
}

/**
 * Cria a sessão criptográfica do Worker.
 */
export const workerSession = new Session({
    actor: contractAccount,
    permission: 'microservice',
    chain: {
        id: chainId,
        url: rpcUrl // Correção: Passando a string URL diretamente
    },
    walletPlugin: new WalletPluginPrivateKey(privateKey)
});

/**
 * Trava o jogo, impedindo novas compras de cartelas.
 */
export async function executeLockGame(gameId: string) {
    console.log(`🔒 [Blockchain] Enviando transação: lockgame para o jogo ${gameId}...`);
    try {
        const result = await workerSession.transact({
            actions: [{
                account: contractAccount,
                name: 'lockgame',
                authorization: [workerSession.permissionLevel],
                data: { game_id: gameId }
            }]
        }, { broadcast: true });
        
        console.log(`✅ Jogo ${gameId} travado! TX: ${result.response?.transaction_id}`);
        return result.response?.transaction_id;
    } catch (error) {
        console.error(`❌ Falha ao travar o jogo ${gameId}:`, error);
        throw error;
    }
}

/**
 * Dispara o pedido de entropia para o Oráculo.
 */
export async function executeStartDraw(gameId: string) {
    console.log(`🎲 [Blockchain] Enviando transação: startdraw para o jogo ${gameId}...`);
    try {
        const result = await workerSession.transact({
            actions: [{
                account: contractAccount,
                name: 'startdraw',
                authorization: [workerSession.permissionLevel],
                data: { game_id: gameId }
            }]
        }, { broadcast: true });
        
        console.log(`✅ Sorteio iniciado (Aguardando Oráculo)! TX: ${result.response?.transaction_id}`);
        return result.response?.transaction_id;
    } catch (error) {
        console.error(`❌ Falha ao iniciar sorteio do jogo ${gameId}:`, error);
        throw error;
    }
}

/**
 * Reivindica o prêmio para uma cartela vencedora, transferindo os fundos no Smart Contract.
 *
 * @param gameId       - ID do jogo (uint64 como string)
 * @param ticketId     - ID da cartela vencedora (uint64 como string)
 * @param ballCount    - Quantidade de bolas sorteadas até o momento da vitória
 * @param winPatternMask - Bitmask uint64 do padrão de vitória (ex: ROW_0 = 0x108421)
 *
 * Atenção: o contrato exige `ball_count` e `win_pattern_mask` para validação
 * on-chain da legitimidade da vitória. O backend é o único que tem acesso
 * ao estado completo do jogo, portanto esses valores são autoritativos.
 */
export async function executeClaimWin(
    gameId: string,
    ticketId: string,
    ballCount: number,
    winPatternMask: bigint
): Promise<string | undefined> {
    console.log(
        `🏆 [Blockchain] claimwin — jogo ${gameId}, cartela #${ticketId}, ` +
        `${ballCount} bolas, padrão 0x${winPatternMask.toString(16)}...`
    );
    try {
        const result = await workerSession.transact({
            actions: [{
                account: contractAccount,
                name: 'claimwin',
                authorization: [workerSession.permissionLevel],
                data: {
                    game_id:          gameId,
                    ticket_id:        ticketId,
                    ball_count:       ballCount,
                    win_pattern_mask: winPatternMask.toString(), // uint64 → string para o Wharfkit serializar
                }
            }]
        }, { broadcast: true });

        const txId = result.response?.transaction_id;
        console.log(`✅ Prêmio liquidado para cartela #${ticketId}! TX: ${txId}`);
        return txId;
    } catch (error) {
        console.error(`❌ Falha ao liquidar cartela #${ticketId}:`, error);
        throw error;
    }
}