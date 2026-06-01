// apps/worker-game-loop/src/services/blockchain.ts
// Camada de transações on-chain do worker.
// Ref: SPEC.md §2 (ABI), architecture.md §4.1

import { Session }                from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import dotenv                     from 'dotenv';

dotenv.config();

const microserviceKey = process.env.MICROSERVICE_PRIVATE_KEY!;
const contractKey     = process.env.CONTRACT_PRIVATE_KEY || microserviceKey;
const chainId         = process.env.CHAIN_ID!;
const contractAccount = process.env.CONTRACT_ACCOUNT || 'bingo.game';
const rpcUrl          = process.env.RPC_URL           || 'http://127.0.0.1:8888';

const chain = { id: chainId, url: rpcUrl };

if (!microserviceKey || !chainId) {
    throw new Error('❌ Faltam variáveis de ambiente críticas (MICROSERVICE_PRIVATE_KEY ou CHAIN_ID).');
}

// Sessão com a permission microservice para ações que exigem require_auth("microservice"_n)
export const microserviceSession = new Session({
    actor:        'microservice',
    permission:   'active',
    chain,
    walletPlugin: new WalletPluginPrivateKey(microserviceKey),
});

// Sessão com a permission active do contrato para ações que exigem require_auth(get_self())
export const contractSession = new Session({
    actor:        contractAccount,
    permission:   'active',
    chain,
    walletPlugin: new WalletPluginPrivateKey(contractKey),
});

// Helper que escolhe a sessão conforme a action
async function transact(actionName: string, data: object, useMicroservice: boolean = false): Promise<string | undefined> {
    const session = useMicroservice ? microserviceSession : contractSession;
    const result = await session.transact({
        actions: [{
            account:       contractAccount,
            name:          actionName,
            authorization: [session.permissionLevel],
            data,
        }],
    }, { broadcast: true });
    return result.response?.transaction_id;
}

// ── FSM Transitions ────────────────────────────────────────────────────────────

/** CREATED → FUNDING: abre as vendas. */
export async function executeFundGame(gameId: string): Promise<string | undefined> {
    console.log(`🟢 [Blockchain] fundgame → jogo ${gameId}`);
    const txId = await transact('fundgame', { game_id: gameId }, true);
    console.log(`✅ Jogo ${gameId} aberto para vendas. TX: ${txId}`);
    return txId;
}

/** FUNDING → LOCKED: fecha as vendas. */
export async function executeLockGame(gameId: string): Promise<string | undefined> {
    console.log(`🔒 [Blockchain] lockgame → jogo ${gameId}`);
    const txId = await transact('lockgame', { game_id: gameId }, true);
    console.log(`✅ Jogo ${gameId} travado. TX: ${txId}`);
    return txId;
}

/** LOCKED → DRAWING: aciona o oráculo. */
export async function executeStartDraw(gameId: string): Promise<string | undefined> {
    console.log(`🎲 [Blockchain] startdraw → jogo ${gameId}`);
    const txId = await transact('startdraw', { game_id: gameId }, true);
    console.log(`✅ Sorteio iniciado (aguardando oráculo). TX: ${txId}`);
    return txId;
}

/**
 * DRAWN|PAYING → PAYING: liquida o prêmio ao vencedor.
 * ADR-012: jogo transiciona drawn→paying na primeira chamada.
 * Worker chama executeCloseGame() após o lote completo.
 *
 * @param goldenMultiplier - 0 ou 1 = sem efeito; >1 = GOLDEN_BALL mode
 */
export async function executeClaimWin(
    gameId:           string,
    ticketId:         string,
    ballCount:        number,
    winPatternMask:   bigint,
    goldenMultiplier: number = 0,
): Promise<string | undefined> {
    console.log(
        `🏆 [Blockchain] claimwin → jogo ${gameId}, cartela #${ticketId}, ` +
        `${ballCount} bolas, padrão 0x${winPatternMask.toString(16)}` +
        (goldenMultiplier > 1 ? ` 🌟×${goldenMultiplier}` : '')
    );
    const txId = await transact('claimwin', {
        game_id:           gameId,
        ticket_id:         ticketId,
        ball_count:        ballCount,
        win_pattern_mask:  winPatternMask.toString(),
        golden_multiplier: goldenMultiplier,
    }, true);
    console.log(`✅ Prêmio liquidado para cartela #${ticketId}. TX: ${txId}`);
    return txId;
}

/**
 * DRAWN|PAYING → PAYING: liquida o prêmio de um ticket por estágio MULTI_MATCH.
 * ADR-013: cada ticket pode ganhar múltiplos estágios independentemente.
 * Worker chama executeCloseGame() após todos os claimstage do lote.
 */
export async function executeClaimStage(
    gameId:         string,
    ticketId:       string,
    stage:          number,
    ballCount:      number,
    winPatternMask: bigint,
): Promise<string | undefined> {
    console.log(
        `🎯 [Blockchain] claimstage → jogo ${gameId}, cartela #${ticketId}, ` +
        `estágio ${stage}, ${ballCount} bolas, padrão 0x${winPatternMask.toString(16)}`
    );
    const txId = await transact('claimstage', {
        game_id:          gameId,
        ticket_id:        ticketId,
        stage,
        ball_count:       ballCount,
        win_pattern_mask: winPatternMask.toString(),
    }, true);
    console.log(`✅ Estágio ${stage} liquidado para cartela #${ticketId}. TX: ${txId}`);
    return txId;
}

/**
 * PAYING|DRAWN → ARCHIVED: encerra o jogo após todos os claimwin do lote.
 * ADR-012: substitui a lógica anterior onde claimwin arquivava diretamente.
 */
export async function executeCloseGame(gameId: string): Promise<string | undefined> {
    console.log(`📦 [Blockchain] closegame → jogo ${gameId}`);
    const txId = await transact('closegame', { game_id: gameId }, true);
    console.log(`✅ Jogo ${gameId} arquivado. TX: ${txId}`);
    return txId;
}

/**
 * LOCKED|DRAWING → ABORTED: fail-safe.
 * Chamado pelo worker após timeout do oráculo.
 * Ref: SPEC.md §5.2, COMPLIANCE.md §4
 */
export async function executeAbortGame(gameId: string, reason: string): Promise<string | undefined> {
    console.log(`❌ [Blockchain] abortgame → jogo ${gameId} (motivo: ${reason})`);
    const txId = await transact('abortgame', { game_id: gameId, reason }, true);
    console.log(`✅ Jogo ${gameId} abortado. TX: ${txId}`);
    return txId;
}

/**
 * Estorna um ticket individualmente (O(1)).
 * Callable por qualquer um quando status = ABORTED.
 * O worker processa o lote de estornos no ritmo tolerado pelo budget de CPU da WAX.
 * Ref: SPEC.md §5.2
 */
export async function executeRefundTicket(
    gameId:   string,
    ticketId: string,
): Promise<string | undefined> {
    console.log(`💸 [Blockchain] refundticket → jogo ${gameId}, cartela #${ticketId}`);
    const txId = await transact('refundticket', { game_id: gameId, ticket_id: ticketId }, true);
    console.log(`✅ Cartela #${ticketId} estornada. TX: ${txId}`);
    return txId;
}

/**
 * Apaga tickets em lote após a quarentena de 24h.
 * max_rows limita a iteração ao budget de CPU do bloco WAX (~30ms).
 * Deve ser chamado repetidamente até não haver mais linhas.
 * Ref: SPEC.md §5.1
 */
export async function executeClearGame(
    gameId:   string,
    maxRows:  number = 50,
): Promise<string | undefined> {
    console.log(`🧹 [Blockchain] cleargame → jogo ${gameId} (max_rows: ${maxRows})`);
    const txId = await transact('cleargame', { game_id: gameId, max_rows: maxRows }, true);
    console.log(`✅ Lote de RAM liberado para jogo ${gameId}. TX: ${txId}`);
    return txId;
}
