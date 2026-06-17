// apps/frontend/src/hooks/useTicketPurchase.ts
// Hook que orquestra o fluxo completo de compra de cartelas:
//
//   1. Gera N cartelas assinadas via backend (/tickets/generate) — preview
//   2. Usuário visualiza, remove ou adiciona mais cartelas (preview)
//   3. Submete buytickets() para cada grupo de preço na confirmação
//
// Quando swapAction fornecida (ADR-021), a transação inclui 3 ações atômicas:
//   transfer user→bingogameswp (swap)  →  transfer user→bingogamectr (deposit)  →  buytickets
//
// Ref: ADR-001, ADR-021, SPEC.md §2.1

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { generateSignedTickets, type SignedTicket } from '../services/api';

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';
const SWAP_ACCOUNT     = import.meta.env.VITE_SWAP_CONTRACT    ?? 'bingogameswp';
const BATCH_SIZE       = 50;

/**
 * Quando o usuário paga com moeda alternativa (ADR-021), este bloco descreve
 * as duas actions extras que precedem `buytickets`:
 *   1. transfer user → bingogameswp  (executa o swap)
 *   2. transfer user → bingogamectr  (deposita o token da sala para compra)
 */
export interface SwapAction {
    /** Contrato do token de origem (ex: "bingogametkn") */
    fromContract:  string;
    /** Quantidade total a enviar ao swap com fees (ex: "123.4567 BINGO") */
    amountIn:      string;
    /** min_out com margem de slippage 0.5% (unidades mínimas como string) */
    minOut:        string;
    /** pool_id do bingogameswp */
    poolId:        string;
    /** Contrato do token de destino (ex: "eosio.token") */
    toContract:    string;
    /** Quantidade exata a depositar no bingogamectr (ex: "10.00000000 WAX") */
    amountOut:     string;
}

export interface PurchaseGroup {
    tickets: SignedTicket[];
    price:   { quantity: string; contract: string };
}

export interface PurchaseResult {
    transactionId: string;
    ticketCount: number;
    tickets: SignedTicket[];
}

export interface UseTicketPurchaseReturn {
    isPurchasing: boolean;
    purchaseError: string | null;
    lastPurchase: PurchaseResult | null;
    /** Gera N cartelas assinadas (para preview). nftId: asset_id da NFT de desconto (ADR-028 §6). */
    generateForPreview: (gameId: string, count: number, nftId?: string) => Promise<SignedTicket[]>;
    /**
     * Submete um ou mais grupos ao contrato. Cada grupo vira uma tx separada.
     * swapAction: quando fornecida, prefixa a tx com swap+deposit antes do buytickets.
     * nftId: deve casar com o nftId usado em generateForPreview (mesmo hash).
     */
    purchaseTickets: (
        session:    Session,
        gameId:     string,
        groups:     PurchaseGroup[],
        swapAction?: SwapAction,
        nftId?:      string,
    ) => Promise<PurchaseResult | null>;
    clearError: () => void;
}

async function submitBatch(
    session:        Session,
    gameId:         string,
    tickets:        SignedTicket[],
    requestedPrice: { quantity: string; contract: string },
    swapAction?:    SwapAction,
    nftId?:         string,
): Promise<string> {
    const matrices   = tickets.map(t => t.matrix);
    const signatures = tickets.map(t => t.signature);

    const buyAction = {
        account:       CONTRACT_ACCOUNT,
        name:          'buytickets',
        authorization: [session.permissionLevel],
        data: {
            buyer:           String(session.actor),
            game_id:         gameId,
            matrices,
            signatures,
            nft_id:          nftId && nftId !== '0' ? BigInt(nftId) : 0n,
            requested_price: requestedPrice,
        },
    };

    // Fluxo swap: 3 ações atômicas — swap + deposit + buytickets
    const actions = swapAction
        ? [
            {
                account:       swapAction.fromContract,
                name:          'transfer',
                authorization: [session.permissionLevel],
                data: {
                    from:     String(session.actor),
                    to:       SWAP_ACCOUNT,
                    quantity: swapAction.amountIn,
                    memo:     `swap,${swapAction.poolId},${swapAction.minOut},${String(session.actor)}`,
                },
            },
            {
                account:       swapAction.toContract,
                name:          'transfer',
                authorization: [session.permissionLevel],
                data: {
                    from:     String(session.actor),
                    to:       CONTRACT_ACCOUNT,
                    quantity: swapAction.amountOut,
                    memo:     'deposit',
                },
            },
            buyAction,
        ]
        : [buyAction];

    console.log(`📡 [Purchase] Submetendo ${swapAction ? 'swap+deposit+' : ''}buytickets() para ${tickets.length} cartela(s)...`);

    const result = await session.transact({ actions }, { broadcast: true });
    return result.response?.transaction_id ?? 'pending';
}

export function useTicketPurchase(): UseTicketPurchaseReturn {
    const { t } = useTranslation();
    const [isPurchasing,  setIsPurchasing]  = useState(false);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);
    const [lastPurchase,  setLastPurchase]  = useState<PurchaseResult | null>(null);

    const clearError = useCallback(() => setPurchaseError(null), []);

    const generateForPreview = useCallback(async (
        gameId: string,
        count: number,
        nftId?: string,
    ): Promise<SignedTicket[]> => {
        const all: SignedTicket[] = [];
        let remaining = count;
        while (remaining > 0) {
            const n = Math.min(remaining, BATCH_SIZE);
            const { tickets } = await generateSignedTickets(gameId, n, nftId);
            all.push(...tickets);
            remaining -= n;
        }
        return all;
    }, []);

    const purchaseTickets = useCallback(async (
        session:     Session,
        gameId:      string,
        groups:      PurchaseGroup[],
        swapAction?: SwapAction,
        nftId?:      string,
    ): Promise<PurchaseResult | null> => {

        setIsPurchasing(true);
        setPurchaseError(null);

        const allTickets: SignedTicket[] = [];
        let lastTxId = 'pending';

        try {
            for (const group of groups) {
                if (group.tickets.length === 0) continue;

                const price = group.price;
                let remaining = group.tickets.length;
                let offset = 0;

                while (remaining > 0) {
                    const chunkSize = Math.min(remaining, BATCH_SIZE);
                    const chunk = group.tickets.slice(offset, offset + chunkSize);
                    // swapAction só é embutido no primeiro batch; demais são pagamentos normais
                    const swap = offset === 0 ? swapAction : undefined;
                    const txId = await submitBatch(session, gameId, chunk, price, swap, nftId);
                    lastTxId = txId;

                    allTickets.push(...chunk);
                    offset    += chunkSize;
                    remaining -= chunkSize;
                }
            }

            const purchaseResult: PurchaseResult = {
                transactionId: lastTxId,
                ticketCount: allTickets.length,
                tickets: allTickets,
            };

            setLastPurchase(purchaseResult);
            console.log(`✅ [Purchase] Total: ${allTickets.length} cartela(s). Última TX: ${lastTxId}`);

            return purchaseResult;

        } catch (err) {
            const raw = err instanceof Error ? err.message : String(err);
            const message = raw.includes('overdrawn balance')
                ? t('buy_ticket.error_overdrawn')
                : raw.includes('Game is not in FUNDING')
                ? t('buy_ticket.error_funding_ended')
                : raw.includes('assert_recover_key')
                ? t('buy_ticket.error_invalid_signature')
                : raw.includes('min_out')
                ? t('buy_ticket.error_slippage')
                : t('buy_ticket.error_generic', { raw });

            console.error('[Purchase] Falha:', err);
            setPurchaseError(message);
            return null;

        } finally {
            setIsPurchasing(false);
        }
    }, [t]);

    return { isPurchasing, purchaseError, lastPurchase, generateForPreview, purchaseTickets, clearError };
}
