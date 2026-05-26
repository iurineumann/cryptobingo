// apps/frontend/src/components/BuyTicketModal.tsx
// Modal de compra de cartelas — migrado para Tailwind v4 + Design System cb-*.
// Ref: ADR-001, SPEC.md §2.1

import { useState }          from 'react';
import { Session }           from '@wharfkit/session';
import { useTicketPurchase } from '../hooks/useTicketPurchase';
import TicketGrid            from './TicketGrid';
import type { ExtendedAsset } from '@cryptobingo/shared-types';

interface BuyTicketModalProps {
    gameId:      string;
    ticketPrice: ExtendedAsset;
    session:     Session;
    onClose:     () => void;
    onSuccess:   () => void;
}

const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_URL ?? 'https://wax.bloks.io';
const MAX_TICKETS   = 10;

export default function BuyTicketModal({
    gameId, ticketPrice, session, onClose, onSuccess,
}: BuyTicketModalProps) {

    const [count, setCount] = useState(1);
    const { isPurchasing, purchaseError, lastPurchase, purchaseTickets, clearError } = useTicketPurchase();

    const handleBuy = async () => {
        clearError();
        const result = await purchaseTickets(session, gameId, count);
        if (result) onSuccess();
    };

    const dec = () => setCount(c => Math.max(1, c - 1));
    const inc = () => setCount(c => Math.min(MAX_TICKETS, c + 1));

    const [priceAmount, priceSymbol] = ticketPrice.quantity.split(' ');
    const totalDisplay = `${(parseFloat(priceAmount) * count).toFixed(4)} ${priceSymbol}`;

    // ── Tela de sucesso ───────────────────────────────────────────────────────
    if (lastPurchase) {
        return (
            <div
                className="cb-overlay"
                onClick={e => e.target === e.currentTarget && onClose()}
                role="dialog"
                aria-modal="true"
                aria-labelledby="modal-success-title"
            >
                <div className="cb-modal" style={{ maxWidth: '44rem' }}>

                    {/* Header */}
                    <div className="cb-modal-header">
                        <h2 id="modal-success-title" className="cb-modal-title flex items-center gap-2">
                            <span aria-hidden="true">🎉</span>
                            Cartelas Adquiridas!
                        </h2>
                        <button className="cb-modal-close" onClick={onClose} aria-label="Fechar">✕</button>
                    </div>

                    {/* Confirmação */}
                    <div className="cb-alert cb-alert-success mb-4">
                        <span aria-hidden="true">✅</span>
                        <span>
                            <strong>{lastPurchase.ticketCount}</strong> cartela{lastPurchase.ticketCount > 1 ? 's' : ''} adquirida{lastPurchase.ticketCount > 1 ? 's' : ''} na sala <strong>#{gameId}</strong>.
                        </span>
                    </div>

                    {/* Link da transação */}
                    {lastPurchase.transactionId !== 'pending' && (
                        <a
                            href={`${EXPLORER_BASE}/transaction/${lastPurchase.transactionId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs text-[--cb-brand] hover:underline font-mono break-all mb-4"
                        >
                            <span aria-hidden="true">🔗</span>
                            TX: {lastPurchase.transactionId.slice(0, 24)}…
                        </a>
                    )}

                    {/* Cartelas */}
                    <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">
                        Suas Cartelas
                    </h3>
                    <div className="flex flex-wrap gap-5 justify-center max-h-96 overflow-y-auto py-2">
                        {lastPurchase.tickets.map((ticket, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-1">
                                <span className="text-xs font-bold text-[--cb-text-tertiary]">
                                    #{idx + 1}
                                </span>
                                <TicketGrid matrix={ticket.matrix} />
                            </div>
                        ))}
                    </div>

                    <button
                        className="cb-btn cb-btn-primary cb-btn-pill w-full mt-5"
                        onClick={onClose}
                    >
                        Fechar
                    </button>
                </div>
            </div>
        );
    }

    // ── Tela de compra ────────────────────────────────────────────────────────
    return (
        <div
            className="cb-overlay"
            onClick={e => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-buy-title"
        >
            <div className="cb-modal" style={{ maxWidth: '26rem' }}>

                {/* Header */}
                <div className="cb-modal-header">
                    <h2 id="modal-buy-title" className="cb-modal-title flex items-center gap-2">
                        <span aria-hidden="true">🎲</span>
                        Comprar Cartelas
                    </h2>
                    <button
                        className="cb-modal-close"
                        onClick={onClose}
                        disabled={isPurchasing}
                        aria-label="Fechar"
                    >
                        ✕
                    </button>
                </div>

                {/* Identificação do jogo */}
                <p className="text-sm text-[--cb-text-secondary] mb-5">
                    Sala <span className="font-bold text-[--cb-text-primary]">#{gameId}</span>
                    <span className="cb-badge cb-badge-success ml-2">🟢 Vendas Abertas</span>
                </p>

                {/* Seletor de quantidade */}
                <fieldset className="mb-5">
                    <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-3">
                        Quantidade de cartelas
                    </legend>
                    <div className="flex items-center justify-center gap-4">
                        <button
                            className="cb-btn cb-btn-outline w-11 h-11 p-0 text-xl rounded-full"
                            onClick={dec}
                            disabled={isPurchasing || count <= 1}
                            aria-label="Diminuir quantidade"
                        >
                            −
                        </button>
                        <span
                            className="text-3xl font-black text-[--cb-text-primary] min-w-[3rem] text-center tabular-nums"
                            aria-live="polite"
                            aria-label={`${count} cartela${count > 1 ? 's' : ''}`}
                        >
                            {count}
                        </span>
                        <button
                            className="cb-btn cb-btn-outline w-11 h-11 p-0 text-xl rounded-full"
                            onClick={inc}
                            disabled={isPurchasing || count >= MAX_TICKETS}
                            aria-label="Aumentar quantidade"
                        >
                            +
                        </button>
                    </div>

                    {/* Quick select */}
                    <div className="flex justify-center gap-2 mt-3 flex-wrap">
                        {[1, 3, 5, 10].map(n => (
                            <button
                                key={n}
                                className={[
                                    'cb-btn cb-btn-sm rounded-full tabular-nums',
                                    count === n ? 'cb-btn-primary' : 'cb-btn-ghost',
                                ].join(' ')}
                                onClick={() => setCount(n)}
                                disabled={isPurchasing}
                                aria-pressed={count === n}
                            >
                                {n}×
                            </button>
                        ))}
                    </div>
                </fieldset>

                {/* Resumo de custo */}
                <div className="rounded-xl border border-[--cb-border-default] bg-[--cb-bg-sunken] p-4 mb-5 space-y-2">
                    <div className="flex justify-between text-sm text-[--cb-text-secondary]">
                        <span>Preço unitário</span>
                        <span className="font-mono">{ticketPrice.quantity}</span>
                    </div>
                    <div className="flex justify-between text-sm text-[--cb-text-secondary]">
                        <span>Quantidade</span>
                        <span>× {count}</span>
                    </div>
                    <div className="cb-divider !my-1.5" />
                    <div className="flex justify-between font-bold">
                        <span className="text-[--cb-text-primary]">Total</span>
                        <span className="text-[--cb-brand] text-lg tabular-nums font-mono">
                            {totalDisplay}
                        </span>
                    </div>
                </div>

                {/* Erro */}
                {purchaseError && (
                    <div className="cb-alert cb-alert-error mb-4" role="alert">
                        <span aria-hidden="true">⚠️</span>
                        <span>{purchaseError}</span>
                    </div>
                )}

                {/* Botões */}
                <div className="flex gap-3">
                    <button
                        className="cb-btn cb-btn-ghost flex-1"
                        onClick={onClose}
                        disabled={isPurchasing}
                    >
                        Cancelar
                    </button>
                    <button
                        className={[
                            'cb-btn cb-btn-primary flex-[2]',
                            isPurchasing ? 'cb-btn-loading' : '',
                        ].join(' ')}
                        onClick={handleBuy}
                        disabled={isPurchasing}
                        aria-busy={isPurchasing}
                    >
                        {isPurchasing
                            ? 'Processando…'
                            : `Comprar ${count} Cartela${count > 1 ? 's' : ''}`}
                    </button>
                </div>

                <p className="text-xs text-center text-[--cb-text-tertiary] mt-3">
                    Debitado do saldo interno via{' '}
                    <span className="font-mono">bingo.game</span>
                </p>
            </div>
        </div>
    );
}
