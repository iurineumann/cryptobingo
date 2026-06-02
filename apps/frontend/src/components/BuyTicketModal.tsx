// apps/frontend/src/components/BuyTicketModal.tsx
// Modal de compra de cartelas — fluxo completo:
//   form → generate preview → preview (remove/add more) → confirm → success
// Ref: ADR-001, SPEC.md §2.1

import { useState, useEffect, useCallback } from 'react';
import { useTranslation }    from 'react-i18next';
import { Session }           from '@wharfkit/session';
import { useTicketPurchase, type PurchaseGroup } from '../hooks/useTicketPurchase';
import TicketGrid            from './TicketGrid';
import type { ExtendedAsset } from '@cryptobingo/shared-types';
import type { SignedTicket } from '../services/api';

interface ExtendedAssetInput {
    quantity: string;
    contract: string;
}

interface BuyTicketModalProps {
    gameId:      string;
    ticketPrice: ExtendedAsset;
    session:     Session;
    onClose:     () => void;
    onSuccess:   () => void;
    maxTicketsPerPlayer?: number;
    roomPriceMin?: ExtendedAssetInput;
    roomPriceMax?: ExtendedAssetInput;
    roomPriceDefault?: ExtendedAssetInput;
}

interface TicketBatch {
    id:      string;
    price:   { quantity: string; contract: string };
    tickets: SignedTicket[];
}

const EXPLORER_BASE = import.meta.env.VITE_EXPLORER_URL ?? 'https://wax.bloks.io';

type Step = 'form' | 'preview';

let batchIdCounter = 0;

export default function BuyTicketModal({
    gameId, ticketPrice, session, onClose, onSuccess,
    maxTicketsPerPlayer, roomPriceMin, roomPriceMax, roomPriceDefault,
}: BuyTicketModalProps) {

    const { t } = useTranslation();
    const { isPurchasing, purchaseError, lastPurchase, generateForPreview, purchaseTickets, clearError } = useTicketPurchase();

    const defaultQuantity = roomPriceDefault?.quantity ?? ticketPrice.quantity;
    const [customPrice, setCustomPrice] = useState(defaultQuantity);
    const [count, setCount] = useState(1);
    const [step, setStep] = useState<Step>('form');
    const [batches, setBatches] = useState<TicketBatch[]>([]);
    const [generating, setGenerating] = useState(false);

    // Conjunto de "${batchId}:${ticketIdx}" → tickets removidos
    const [removed, setRemoved] = useState<Set<string>>(new Set());

    useEffect(() => {
        setCustomPrice(roomPriceDefault?.quantity ?? ticketPrice.quantity);
        setCount(1);
        setStep('form');
        setBatches([]);
        setRemoved(new Set());
    }, [ticketPrice.quantity, roomPriceDefault?.quantity]);

    const parsedPrice = parseFloat(customPrice.split(' ')[0] || '0');
    const priceError = roomPriceMin && roomPriceMax && !isNaN(parsedPrice)
        ? (parsedPrice < parseFloat(roomPriceMin.quantity.split(' ')[0] || '0')
            ? t('buy_ticket.price_below_min', { min: roomPriceMin.quantity })
            : parsedPrice > parseFloat(roomPriceMax.quantity.split(' ')[0] || '0')
                ? t('buy_ticket.price_above_max', { max: roomPriceMax.quantity })
                : null)
        : null;

    const maxLocal = maxTicketsPerPlayer && maxTicketsPerPlayer > 0
        ? maxTicketsPerPlayer
        : 50;

    // ── Tickets disponíveis (excluindo removidos) ──────────────────────────
    const availableTickets = useCallback(() => {
        const all: Array<{ ticket: SignedTicket; batchId: string; idx: number; price: { quantity: string; contract: string } }> = [];
        for (const batch of batches) {
            for (let i = 0; i < batch.tickets.length; i++) {
                const key = `${batch.id}:${i}`;
                if (!removed.has(key)) {
                    all.push({ ticket: batch.tickets[i], batchId: batch.id, idx: i, price: batch.price });
                }
            }
        }
        return all;
    }, [batches, removed]);

    // ── Gera preview ──────────────────────────────────────────────────────
    const handleGenerate = async () => {
        clearError();
        if (count < 1) return;
        if (priceError) return;

        setGenerating(true);
        try {
            const tickets = await generateForPreview(gameId, count);
            const newBatch: TicketBatch = {
                id:      `b${++batchIdCounter}`,
                price:   { quantity: customPrice, contract: ticketPrice.contract },
                tickets,
            };
            setBatches(prev => [...prev, newBatch]);
            setStep('preview');
        } catch (err) {
            const raw = err instanceof Error ? err.message : String(err);
            setPurchaseErrorRaw(raw);
        } finally {
            setGenerating(false);
        }
    };

    // Fallback: se o purchaseError vier do generate, precisamos de um setter
    // que não existe no hook. Usamos erro local.
    const [localGenError, setLocalGenError] = useState<string | null>(null);
    const setPurchaseErrorRaw = (msg: string) => {
        setLocalGenError(msg);
        // limpa após 5s
        setTimeout(() => setLocalGenError(null), 5000);
    };

    // ── Remove um ticket ───────────────────────────────────────────────────
    const handleRemoveTicket = (batchId: string, idx: number) => {
        setRemoved(prev => {
            const next = new Set(prev);
            next.add(`${batchId}:${idx}`);
            return next;
        });
    };

    // ── Voltar ao form (preservando batches existentes) ────────────────────
    const handleBackToForm = () => {
        setStep('form');
    };

    // ── Confirmar compra ───────────────────────────────────────────────────
    const handleBuy = async () => {
        clearError();
        const avail = availableTickets();
        if (avail.length === 0) return;

        // Agrupa por preço
        const priceMap = new Map<string, PurchaseGroup>();
        for (const item of avail) {
            const key = `${item.price.quantity}|${item.price.contract}`;
            if (!priceMap.has(key)) {
                priceMap.set(key, { tickets: [], price: item.price });
            }
            priceMap.get(key)!.tickets.push(item.ticket);
        }

        const groups = Array.from(priceMap.values());
        const result = await purchaseTickets(session, gameId, groups);
        if (result) onSuccess();
    };

    // ── Totais ─────────────────────────────────────────────────────────────
    const avail = availableTickets();
    const totalCount = avail.length;
    const totalPrice = avail.reduce((sum, item) => {
        const amt = parseFloat(item.price.quantity.split(' ')[0] || '0');
        return sum + amt;
    }, 0);
    const totalSymbol = customPrice.split(' ')[1] || 'BINGO';
    const totalDisplay = `${totalPrice.toFixed(4)} ${totalSymbol}`;

    const currentPriceAmount = parseFloat(customPrice.split(' ')[0] || '0');
    const currentCostDisplay = `${(currentPriceAmount * count).toFixed(4)} ${customPrice.split(' ')[1] || totalSymbol}`;

    // ── Tela de sucesso (pós-compra) ───────────────────────────────────────
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

                    <div className="cb-modal-header">
                        <h2 id="modal-success-title" className="cb-modal-title flex items-center gap-2">
                            <span aria-hidden="true">🎉</span>
                            {t('buy_ticket.success_title')}
                        </h2>
                        <button className="cb-modal-close" onClick={onClose} aria-label={t('common.close')}>✕</button>
                    </div>

                    <div className="cb-alert cb-alert-success mb-4">
                        <span aria-hidden="true">✅</span>
                        <span>
                            <strong>{lastPurchase.ticketCount}</strong> {t('buy_ticket.success_msg', { count: lastPurchase.ticketCount, gameId })}
                        </span>
                    </div>

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

                    <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3">
                        {t('buy_ticket.your_tickets')}
                    </h3>
                    <div className="flex flex-wrap gap-5 justify-center max-h-96 overflow-y-auto py-2">
                        {lastPurchase.tickets.map((ticket, idx) => (
                            <div key={idx} className="flex flex-col items-center gap-1">
                                <span className="text-xs font-bold text-[--cb-text-tertiary]">#{idx + 1}</span>
                                <TicketGrid matrix={ticket.matrix} />
                            </div>
                        ))}
                    </div>

                    <button className="cb-btn cb-btn-primary cb-btn-pill w-full mt-5" onClick={onClose}>
                        {t('buy_ticket.close')}
                    </button>
                </div>
            </div>
        );
    }

    // ── Tela principal ────────────────────────────────────────────────────
    return (
        <div
            className="cb-overlay"
            onClick={e => e.target === e.currentTarget && onClose()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-buy-title"
        >
            <div className="cb-modal" style={{ maxWidth: step === 'preview' ? '44rem' : '26rem' }}>

                {/* ── Header ─────────────────────────────────────────────── */}
                <div className="cb-modal-header">
                    <h2 id="modal-buy-title" className="cb-modal-title flex items-center gap-2">
                        <span aria-hidden="true">🎲</span>
                        {step === 'preview' ? t('buy_ticket.preview_title') : t('buy_ticket.title')}
                    </h2>
                    <button
                        className="cb-modal-close"
                        onClick={onClose}
                        disabled={isPurchasing || generating}
                        aria-label={t('common.close')}
                    >
                        ✕
                    </button>
                </div>

                <p className="text-sm text-[--cb-text-secondary] mb-5">
                    {t('game_room.breadcrumb_room')} <span className="font-bold text-[--cb-text-primary]">#{gameId}</span>
                    <span className="cb-badge cb-badge-success ml-2">🟢 {t('lobby.sales_open')}</span>
                    {maxTicketsPerPlayer && maxTicketsPerPlayer > 0 && (
                        <span className="text-xs text-[--cb-text-tertiary] ml-2">
                            {t('buy_ticket.room_limit_info', { max: maxTicketsPerPlayer })}
                        </span>
                    )}
                </p>

                {/* ── Step: FORM ──────────────────────────────────────────── */}
                {step === 'form' && (
                    <>
                        <fieldset className="mb-5">
                            <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-3">
                                {batches.length > 0
                                    ? t('buy_ticket.add_more_label')
                                    : t('buy_ticket.quantity_label')}
                            </legend>
                            <div className="flex items-center justify-center gap-4">
                                <button
                                    className="cb-btn cb-btn-outline w-11 h-11 p-0 text-xl rounded-full"
                                    onClick={() => setCount(c => Math.max(1, c - 1))}
                                    disabled={generating || count <= 1}
                                    aria-label={t('buy_ticket.decrease_aria')}
                                >−</button>
                                <span
                                    className="text-3xl font-black text-[--cb-text-primary] min-w-[3rem] text-center tabular-nums"
                                    aria-live="polite"
                                >{count}</span>
                                <button
                                    className="cb-btn cb-btn-outline w-11 h-11 p-0 text-xl rounded-full"
                                    onClick={() => setCount(c => Math.min(maxLocal, c + 1))}
                                    disabled={generating || count >= maxLocal}
                                    aria-label={t('buy_ticket.increase_aria')}
                                >+</button>
                            </div>
                            <div className="flex justify-center gap-2 mt-3 flex-wrap">
                                {[1, 3, 5, Math.min(10, maxLocal)].map(n => (
                                    <button
                                        key={n}
                                        className="cb-btn cb-btn-sm rounded-full tabular-nums cb-btn-ghost"
                                        onClick={() => setCount(c => Math.min(maxLocal, c + n))}
                                        disabled={generating || count >= maxLocal}
                                    >+{n}</button>
                                ))}
                            </div>
                        </fieldset>

                        <fieldset className="mb-4">
                            <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-2">
                                {t('buy_ticket.price_label')}
                            </legend>
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    className="cb-input flex-1 font-mono text-sm"
                                    value={customPrice}
                                    onChange={e => setCustomPrice(e.target.value)}
                                    disabled={generating}
                                    aria-label={t('buy_ticket.price_aria')}
                                />
                                {roomPriceMin && roomPriceMax && (
                                    <span className="text-xs text-[--cb-text-tertiary] whitespace-nowrap">
                                        {t('buy_ticket.price_range', {
                                            min: roomPriceMin.quantity,
                                            max: roomPriceMax.quantity,
                                        })}
                                    </span>
                                )}
                            </div>
                        </fieldset>

                        {priceError && (
                            <div className="cb-alert cb-alert-error mb-4 text-sm" role="alert">
                                {priceError}
                            </div>
                        )}

                        <p className="text-sm text-[--cb-text-secondary] text-center mb-4">
                            {t('buy_ticket.cost_preview', { total: currentCostDisplay })}
                        </p>

                        <div className="flex gap-3">
                            {batches.length > 0 && (
                                <button
                                    className="cb-btn cb-btn-ghost flex-1"
                                    onClick={() => setStep('preview')}
                                    disabled={generating}
                                >
                                    {t('buy_ticket.back_to_preview')}
                                </button>
                            )}
                            <button
                                className={[
                                    'cb-btn cb-btn-primary',
                                    batches.length > 0 ? 'flex-1' : 'w-full',
                                ].join(' ')}
                                onClick={handleGenerate}
                                disabled={generating || count < 1 || !!priceError}
                                aria-busy={generating}
                            >
                                {generating
                                    ? t('buy_ticket.generating')
                                    : batches.length > 0
                                        ? t('buy_ticket.add_more_btn')
                                        : t('buy_ticket.generate_btn')}
                            </button>
                        </div>
                    </>
                )}

                {/* ── Step: PREVIEW ───────────────────────────────────────── */}
                {step === 'preview' && (
                    <>
                        {batches.length === 0 ? (
                            <p className="text-sm text-[--cb-text-tertiary] text-center py-8">
                                {t('buy_ticket.no_tickets_preview')}
                            </p>
                        ) : (
                            <div className="max-h-96 overflow-y-auto space-y-4 mb-4">
                                {batches.map(batch => {
                                    const alive = batch.tickets
                                        .map((t, i) => ({ t, i, key: `${batch.id}:${i}` }))
                                        .filter(x => !removed.has(x.key));
                                    if (alive.length === 0) return null;
                                    return (
                                        <div key={batch.id}>
                                            <p className="text-xs font-semibold text-[--cb-text-tertiary] uppercase tracking-wide mb-2">
                                                {t('buy_ticket.batch_price', { price: batch.price.quantity })}
                                                {' · '}
                                                {alive.length} {t('buy_ticket.batch_tickets')}
                                            </p>
                                            <div className="flex flex-wrap gap-3">
                                                {alive.map(({ t: ticket, i }) => (
                                                    <div key={i} className="relative group">
                                                        <TicketGrid matrix={ticket.matrix} />
                                                        <button
                                                            className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white text-xs leading-none opacity-0 group-hover:opacity-100 transition-opacity"
                                                            onClick={() => handleRemoveTicket(batch.id, i)}
                                                            aria-label={t('buy_ticket.remove_ticket_aria')}
                                                            title={t('buy_ticket.remove_ticket')}
                                                        >✕</button>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {totalCount > 0 && (
                            <div className="rounded-xl border border-[--cb-border-default] bg-[--cb-bg-sunken] p-4 mb-5 space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-[--cb-text-secondary]">{t('buy_ticket.total_tickets')}</span>
                                    <span className="font-semibold">{totalCount}</span>
                                </div>
                                <div className="flex justify-between font-bold text-base">
                                    <span className="text-[--cb-text-primary]">{t('buy_ticket.total')}</span>
                                    <span className="text-[--cb-brand] tabular-nums font-mono">{totalDisplay}</span>
                                </div>
                            </div>
                        )}

                        {(purchaseError || localGenError) && (
                            <div className="cb-alert cb-alert-error mb-4" role="alert">
                                <span aria-hidden="true">⚠️</span>
                                <span>{purchaseError || localGenError}</span>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                className="cb-btn cb-btn-ghost flex-1"
                                onClick={handleBackToForm}
                                disabled={isPurchasing || generating}
                            >
                                {t('buy_ticket.generate_more')}
                            </button>
                            <button
                                className={[
                                    'cb-btn cb-btn-primary flex-[2]',
                                    isPurchasing ? 'cb-btn-loading' : '',
                                ].join(' ')}
                                onClick={handleBuy}
                                disabled={isPurchasing || generating || totalCount === 0}
                                aria-busy={isPurchasing}
                            >
                                {isPurchasing
                                    ? t('buy_ticket.processing')
                                    : t('buy_ticket.confirm_buy_count', { count: totalCount })}
                            </button>
                        </div>
                    </>
                )}

                <p className="text-xs text-center text-[--cb-text-tertiary] mt-3">
                    {t('buy_ticket.debited_from')}{' '}
                    <span className="font-mono">bingo.game</span>
                </p>
            </div>
        </div>
    );
}
