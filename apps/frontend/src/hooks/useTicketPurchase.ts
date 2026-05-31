// apps/frontend/src/hooks/useTicketPurchase.ts
// Hook que orquestra o fluxo completo de compra de cartelas:
//
//   1. Chama o backend para gerar N cartelas assinadas (ADR-001)
//   2. Monta a ação buytickets() com as matrizes e assinaturas
//   3. Submete a transação on-chain via Wharfkit session.transact()
//   4. Retorna estado de loading, erro e resultado da TX
//
// O contrato C++ valida a assinatura via assert_recover_key antes de
// debitar o saldo e inserir as cartelas na tabela tickets.
// Ref: ADR-001, SPEC.md §2.1, openapi.yaml /games/{gameId}/tickets/generate

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { generateSignedTickets, type SignedTicket } from '../services/api';

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

export interface PurchaseResult {
    transactionId: string;
    ticketCount: number;
    tickets: SignedTicket[];
}

export interface UseTicketPurchaseReturn {
    isPurchasing: boolean;
    purchaseError: string | null;
    lastPurchase: PurchaseResult | null;
    purchaseTickets: (session: Session, gameId: string, count: number) => Promise<PurchaseResult | null>;
    clearError: () => void;
}

export function useTicketPurchase(): UseTicketPurchaseReturn {
    const { t } = useTranslation();
    const [isPurchasing,  setIsPurchasing]  = useState(false);
    const [purchaseError, setPurchaseError] = useState<string | null>(null);
    const [lastPurchase,  setLastPurchase]  = useState<PurchaseResult | null>(null);

    const clearError = useCallback(() => setPurchaseError(null), []);

    const purchaseTickets = useCallback(async (
        session: Session,
        gameId: string,
        count: number,
    ): Promise<PurchaseResult | null> => {

        setIsPurchasing(true);
        setPurchaseError(null);

        try {
            // ── Fase 1: Solicita cartelas assinadas ao backend ────────────────
            console.log(`🎲 [Purchase] Gerando ${count} cartela(s) para o jogo ${gameId}...`);
            const { tickets } = await generateSignedTickets(gameId, count);

            // ── Fase 2: Monta a ação buytickets() para o contrato ─────────────
            // A ABI do contrato espera:
            //   buytickets(name buyer, uint64 game_id, bytes[] matrices, signature[] signatures, uint64 nft_id)
            // Ref: SPEC.md §2.1

            const matrices   = tickets.map(t => t.matrix);      // vector<vector<uint8_t>>
            const signatures = tickets.map(t => t.signature);   // vector<signature>

            console.log(`📡 [Purchase] Submetendo buytickets() para ${tickets.length} cartela(s)...`);

            const result = await session.transact(
                {
                    actions: [{
                        account:       CONTRACT_ACCOUNT,
                        name:          'buytickets',
                        authorization: [session.permissionLevel],
                        data: {
                            buyer:      String(session.actor),
                            game_id:    gameId,
                            matrices,
                            signatures,
                            nft_id:     0,
                        },
                    }],
                },
                { broadcast: true },
            );

            const transactionId = result.response?.transaction_id ?? 'pending';

            const purchaseResult: PurchaseResult = {
                transactionId,
                ticketCount: tickets.length,
                tickets,
            };

            setLastPurchase(purchaseResult);
            console.log(`✅ [Purchase] ${tickets.length} cartela(s) comprada(s). TX: ${transactionId}`);

            return purchaseResult;

        } catch (err) {
            const raw = err instanceof Error ? err.message : String(err);
            const message = raw.includes('overdrawn balance')
                ? t('buy_ticket.error_overdrawn')
                : raw.includes('funding')
                ? t('buy_ticket.error_funding_ended')
                : raw.includes('assertion failure')
                ? t('buy_ticket.error_invalid_signature')
                : t('buy_ticket.error_generic', { raw });

            console.error('[Purchase] Falha:', err);
            setPurchaseError(message);
            return null;

        } finally {
            setIsPurchasing(false);
        }
    }, []);

    return { isPurchasing, purchaseError, lastPurchase, purchaseTickets, clearError };
}
