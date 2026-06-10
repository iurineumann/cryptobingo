// apps/frontend/src/hooks/useTicketPurchase.ts
// Hook que orquestra o fluxo completo de compra de cartelas:
//
//   1. Gera N cartelas assinadas via backend (/tickets/generate) — preview
//   2. Usuário visualiza, remove ou adiciona mais cartelas (preview)
//   3. Submete buytickets() para cada grupo de preço na confirmação
//
// Se um grupo de tickets exceder BATCH_SIZE (50), o hook divide
// automaticamente em múltiplas chamadas de geração + on-chain.
//
// Ref: ADR-001, SPEC.md §2.1

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { generateSignedTickets, type SignedTicket } from '../services/api';

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
const BATCH_SIZE       = 50;

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
    /** Gera N cartelas assinadas (para preview). Lida com batching interno. */
    generateForPreview: (gameId: string, count: number) => Promise<SignedTicket[]>;
    /** Submete um ou mais grupos ao contrato. Cada grupo vira uma tx separada. */
    purchaseTickets: (session: Session, gameId: string, groups: PurchaseGroup[]) => Promise<PurchaseResult | null>;
    clearError: () => void;
}

async function submitBatch(
    session: Session,
    gameId: string,
    tickets: SignedTicket[],
    requestedPrice: { quantity: string; contract: string },
): Promise<string> {
    const matrices   = tickets.map(t => t.matrix);
    const signatures = tickets.map(t => t.signature);

    console.log(`📡 [Purchase] Submetendo buytickets() para ${tickets.length} cartela(s)...`);

    const result = await session.transact(
        {
            actions: [{
                account:       CONTRACT_ACCOUNT,
                name:          'buytickets',
                authorization: [session.permissionLevel],
                data: {
                    buyer:           String(session.actor),
                    game_id:         gameId,
                    matrices,
                    signatures,
                    nft_id:          0,
                    requested_price: requestedPrice,
                },
            }],
        },
        { broadcast: true },
    );

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
    ): Promise<SignedTicket[]> => {
        const all: SignedTicket[] = [];
        let remaining = count;
        while (remaining > 0) {
            const n = Math.min(remaining, BATCH_SIZE);
            const { tickets } = await generateSignedTickets(gameId, n);
            all.push(...tickets);
            remaining -= n;
        }
        return all;
    }, []);

    const purchaseTickets = useCallback(async (
        session: Session,
        gameId: string,
        groups: PurchaseGroup[],
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
                    const txId = await submitBatch(session, gameId, chunk, price);
                    lastTxId = txId;

                    allTickets.push(...chunk);
                    offset   += chunkSize;
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
