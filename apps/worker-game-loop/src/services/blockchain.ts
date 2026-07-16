// apps/worker-game-loop/src/services/blockchain.ts
// Camada de transações on-chain do worker.
// Ref: SPEC.md §2 (ABI), architecture.md §4.1

import { Session }                from '@wharfkit/session';
import { WalletPluginPrivateKey } from '@wharfkit/wallet-plugin-privatekey';
import dotenv                     from 'dotenv';
import { logger } from './logger';

dotenv.config();

const microserviceKey = process.env.MICROSERVICE_PRIVATE_KEY!;
const chainId         = process.env.CHAIN_ID!;
const contractAccount = process.env.CONTRACT_ACCOUNT || 'bingogamectr';
const rpcUrl          = process.env.RPC_URL           || 'http://127.0.0.1:8888';

const chain = { id: chainId, url: rpcUrl };

if (!microserviceKey || !chainId) {
    throw new Error('❌ Faltam variáveis de ambiente críticas (MICROSERVICE_PRIVATE_KEY ou CHAIN_ID).');
}

// Sessão FSM — actions require_auth("bingogamesvc"_n): fundgame, lock, startdraw, claim*, close, exec
export const microserviceSession = new Session({
    actor:        'bingogamesvc',
    permission:   'active',
    chain,
    walletPlugin: new WalletPluginPrivateKey(microserviceKey),
});

// Sessão admin operacional — actions require_auth(bingogamectr@admin): creategame e similares (ADR-026)
// bingogamectr@admin aceita bingogamesvc@active como signatário — não precisa de CONTRACT_PRIVATE_KEY
export const adminSession = new Session({
    actor:        contractAccount,
    permission:   'admin',
    chain,
    walletPlugin: new WalletPluginPrivateKey(microserviceKey),
});

// Helper interno — todas as actions FSM usam microserviceSession (bingogamesvc@active)
async function transact(actionName: string, data: object): Promise<string | undefined> {
    const session = microserviceSession;
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

/**
 * ADR-028 §3: atualiza mutable_data de uma NFT via atomicassets::setassetdata.
 * Requer que bingogamesvc seja authorized_account da coleção.
 * new_mutable_data = ATTRIBUTE_MAP no formato [{first, second: [variant, value]}].
 */
export async function executeSetAssetData(
    owner:          string,
    assetId:        string,
    collection:     string,
    newMutableData: Array<{ first: string; second: [string, any] }>,
): Promise<string | undefined> {
    const atomicAccount = process.env.ATOMICASSETS_ACCOUNT || 'atomicassets';
    logger.info({ tag: 'Blockchain' }, `setassetdata → ${owner} asset ${assetId} (${newMutableData.length} campos)`)
    const result = await microserviceSession.transact({
        actions: [{
            account:       atomicAccount,
            name:          'setassetdata',
            authorization: [microserviceSession.permissionLevel],
            data: {
                authorized_editor: 'bingogamesvc',
                asset_owner:       owner,
                asset_id:          assetId,
                new_mutable_data:  newMutableData,
            },
        }],
    }, { broadcast: true });
    const txId = result.response?.transaction_id;
    logger.info(`Mutable data atualizado. TX: ${txId}`);
    return txId;
}

/**
 * ADR-028 §8: registra um burn provado off-chain (recordburn, auth bingogamesvc).
 * Idempotente no contrato (rejeita asset_id já registrado). Gera grants BURN_TO_CLAIM.
 */
export async function executeRecordBurn(
    owner:      string,
    assetId:    string,
    templateId: number | string,
    collection: string,
): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `recordburn → ${owner} queimou asset ${assetId} (tpl ${templateId})`)
    const txId = await transact('recordburn', {
        owner,
        asset_id:    assetId,
        template_id: templateId,
        collection,
    });
    logger.info(`Burn registrado. TX: ${txId}`);
    return txId;
}

/** CREATED → FUNDING: abre as vendas. */
export async function executeFundGame(gameId: string): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `fundgame → jogo ${gameId}`)
    const txId = await transact('fundgame', { game_id: gameId });
    logger.info(`Jogo ${gameId} aberto para vendas. TX: ${txId}`);
    return txId;
}

/** FUNDING → LOCKED: fecha as vendas. */
export async function executeLockGame(gameId: string): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `lockgame → jogo ${gameId}`)
    const txId = await transact('lockgame', { game_id: gameId });
    logger.info(`Jogo ${gameId} travado. TX: ${txId}`);
    return txId;
}

/** LOCKED → DRAWING: aciona o oráculo. */
export async function executeStartDraw(gameId: string): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `startdraw → jogo ${gameId}`)
    const txId = await transact('startdraw', { game_id: gameId });
    logger.info(`Sorteio iniciado (aguardando oráculo). TX: ${txId}`);
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
    boostNftIds:      string[] = [],
): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `claimwin → jogo ${gameId}, cartela #${ticketId}, ${ballCount} bolas, padrão 0x${winPatternMask.toString(16)}${goldenMultiplier > 1 ? ` 🌟×${goldenMultiplier}` : ''}${boostNftIds.length ? ` 🚀boost[${boostNftIds.join(',')}]` : ''}`);
    // ADR-028 §7: boost_nft_ids é binary_extension (uint64[]$). Sempre enviado
    // explicitamente (mesmo vazio) — wharfkit não omite binary_extension de array.
    const txId = await transact('claimwin', {
        game_id:           gameId,
        ticket_id:         ticketId,
        ball_count:        ballCount,
        win_pattern_mask:  winPatternMask.toString(),
        golden_multiplier: goldenMultiplier,
        boost_nft_ids:     boostNftIds,
    });
    logger.info(`Prêmio liquidado para cartela #${ticketId}. TX: ${txId}`);
    return txId;
}

/**
 * DRAWN|PAYING → PAYING: liquida o prêmio de um ticket por COMBINAÇÃO (ADR-016).
 * O contrato valida o combo_id contra gametype.combinations e usa o weight
 * registrado on-chain (impede inflar o prêmio). Aceita golden_multiplier.
 * Worker chama executeCloseGame() após o lote completo.
 *
 * @param goldenMultiplier - 0 ou 1 = sem efeito; >1 = GOLDEN_BALL mode
 */
export async function executeClaimCombo(
    gameId:           string,
    ticketId:         string,
    ballCount:        number,
    comboId:          number,
    goldenMultiplier: number = 0,
): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `claimcombo → jogo ${gameId}, cartela #${ticketId}, combo #${comboId}, ${ballCount} bolas${goldenMultiplier > 1 ? ` 🌟×${goldenMultiplier}` : ''}`);
    const txId = await transact('claimcombo', {
        game_id:           gameId,
        ticket_id:         ticketId,
        ball_count:        ballCount,
        combo_id:          comboId,
        golden_multiplier: goldenMultiplier,
    });
    logger.info(`Combinação #${comboId} liquidada para cartela #${ticketId}. TX: ${txId}`);
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
    logger.info({ tag: 'Blockchain' }, `claimstage → jogo ${gameId}, cartela #${ticketId}, estágio ${stage}, ${ballCount} bolas, padrão 0x${winPatternMask.toString(16)}`);
    const txId = await transact('claimstage', {
        game_id:          gameId,
        ticket_id:        ticketId,
        stage,
        ball_count:       ballCount,
        win_pattern_mask: winPatternMask.toString(),
    });
    logger.info(`Estágio ${stage} liquidado para cartela #${ticketId}. TX: ${txId}`);
    return txId;
}

/**
 * DRAWN|PAYING → PAYING: lote de claimwin sem boost/ combo.
 * Tenta claimwinbatch; se action não existir on-chain, fallback 1-a-1.
 * Chunk ~15 entries (Fase 2, #369).
 * SEM boost_nft_ids — boost vai 1-a-1 via single_nft.
 */
export async function executeClaimWinBatch(
    gameId: string,
    entries: Array<{ ticket_id: string; ball_count: number; win_pattern_mask: string; golden_multiplier: number }>,
): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `claimwinbatch → jogo ${gameId}, ${entries.length} entries`);
    try {
        const result = await microserviceSession.transact({
            actions: [{
                account:       contractAccount,
                name:          'claimwinbatch',
                authorization: [microserviceSession.permissionLevel],
                data: { game_id: gameId, entries },
            }],
        }, { broadcast: true });
        const txId = result.response?.transaction_id;
        if (txId) logger.info(`claimwinbatch concluído (${entries.length} entries). TX: ${txId}`);
        return txId;
    } catch (err: any) {
        const msg = err instanceof Error ? err.message : String(err);
        // Fallback: action ausente on-chain → claimwin 1-a-1
        if (/unknown action|not configured to have this abi|does not exist/i.test(msg)) {
            logger.warn({ tag: 'Blockchain' }, `claimwinbatch não disponível. Fallback 1-a-1 (${entries.length} entries).`);
            let lastTxId: string | undefined;
            for (const e of entries) {
                lastTxId = await transact('claimwin', {
                    game_id:           gameId,
                    ticket_id:         e.ticket_id,
                    ball_count:        e.ball_count,
                    win_pattern_mask:  e.win_pattern_mask,
                    golden_multiplier: e.golden_multiplier,
                    boost_nft_ids:     [],
                });
            }
            return lastTxId;
        }
        throw err;
    }
}

/**
 * PAYING|DRAWN → ARCHIVED: encerra o jogo após todos os claimwin do lote.
 * ADR-012: substitui a lógica anterior onde claimwin arquivava diretamente.
 */
export async function executeCloseGame(gameId: string): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `closegame → jogo ${gameId}`)
    const txId = await transact('closegame', { game_id: gameId });
    logger.info(`Jogo ${gameId} arquivado. TX: ${txId}`);
    return txId;
}

/**
 * LOCKED|DRAWING → ABORTED: fail-safe.
 * Chamado pelo worker após timeout do oráculo.
 * Ref: SPEC.md §5.2, COMPLIANCE.md §4
 */
export async function executeAbortGame(gameId: string, reason: string): Promise<string | undefined> {
    logger.info({ tag: 'Blockchain' }, `abortgame → jogo ${gameId} (motivo: ${reason})`)
    const txId = await transact('abortgame', { game_id: gameId, reason });
    logger.info(`Jogo ${gameId} abortado. TX: ${txId}`);
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
    logger.info({ tag: 'Blockchain' }, `refundticket → jogo ${gameId}, cartela #${ticketId}`)
    const txId = await transact('refundticket', { game_id: gameId, ticket_id: ticketId });
    logger.info(`Cartela #${ticketId} estornada. TX: ${txId}`);
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
    logger.info({ tag: 'Blockchain' }, `cleargame → jogo ${gameId} (max_rows: ${maxRows})`)
    const txId = await transact('cleargame', { game_id: gameId, max_rows: maxRows });
    logger.info(`Lote de RAM liberado para jogo ${gameId}. TX: ${txId}`);
    return txId;
}
