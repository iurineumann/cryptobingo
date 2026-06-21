// apps/frontend/src/components/BuyTicketModal.tsx
// Modal de compra de cartelas — fluxo completo:
//   form → generate preview → preview (remove/add more) → confirm → success
// ADR-021: seletor de moeda alternativa via bingogameswp
// Ref: ADR-001, ADR-021, SPEC.md §2.1

import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation }    from 'react-i18next';
import { Session }           from '@wharfkit/session';
import { useTicketPurchase, type PurchaseGroup, type SwapAction } from '../hooks/useTicketPurchase';
import TicketGrid            from './TicketGrid';
import type { ExtendedAsset } from '@cryptobingo/shared-types';
import type { SignedTicket } from '../services/api';
import {
    fetchSwapPools,
    fetchSwapQuote,
    getAlternativeToken,
    poolRoutesTo,
    fetchTokenBalance,
    type QuoteParams,
} from '../services/swapService';
import type { SwapPoolSummary, SwapQuote } from '@cryptobingo/shared-types';
import { fetchEligibleDiscountNfts, type EligibleDiscountNft } from '../services/api';
import { X, PartyPopper, Check, Link2, Dices, Timer, TriangleAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

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
    gameEndTime?: number; // Unix timestamp (seconds) — para limitar TTL da cotação
    nftTemplateAllowlist?: number[]; // templates permitidos na sala (vazio = todos)
}

interface AltToken {
    contract:  string;
    symbol:    string;
    precision: number;
    poolId:    string;
    balance:   bigint;
}

interface TicketBatch {
    id:      string;
    price:   { quantity: string; contract: string };
    tickets: SignedTicket[];
}

const EXPLORER_BASE  = import.meta.env.VITE_EXPLORER_URL ?? 'https://wax.bloks.io';
const AUTO_LOCK_SEC  = 60; // deve coincidir com AUTO_LOCK_DELAY_SEC do worker

function fmtCountdown(ms: number): string {
    if (ms <= 0) return '0s';
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

/** Converte "10.0000 BINGO" em unidades mínimas bigint, dado precision */
function toMinUnits(displayQty: string, precision: number): bigint {
    const [amount] = displayQty.split(' ');
    if (!amount) return 0n;
    const [whole, frac = ''] = amount.split('.');
    const fracPadded = frac.padEnd(precision, '0').slice(0, precision);
    return BigInt(whole + fracPadded);
}

/** Extrai símbolo de "4,BINGO" → "BINGO" */
function symCode(sym: string): string {
    return sym.includes(',') ? (sym.split(',')[1] ?? sym) : sym;
}

/** Extrai símbolo de "10.0000 BINGO" → "BINGO" */
function extractSymbol(quantity: string): string {
    return quantity.split(' ')[1] ?? '';
}

type Step = 'form' | 'preview';

let batchIdCounter = 0;

export default function BuyTicketModal({
    gameId, ticketPrice, session, onClose, onSuccess,
    maxTicketsPerPlayer, roomPriceMin, roomPriceMax, roomPriceDefault,
    gameEndTime, nftTemplateAllowlist,
}: BuyTicketModalProps) {

    const { t } = useTranslation();
    const { isPurchasing, purchaseError, lastPurchase, generateForPreview, purchaseTickets, clearError } = useTicketPurchase();

    // ── Countdown do funding ──────────────────────────────────────────────────
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(id);
    }, []);

    const closesAt   = Number(gameId) + AUTO_LOCK_SEC * 1_000;
    const remaining  = closesAt - now;
    const isUrgent   = remaining > 0 && remaining < 15_000;
    const isClosed   = remaining <= 0;

    const defaultQuantity = roomPriceDefault?.quantity ?? ticketPrice.quantity;
    const [customPrice, setCustomPrice] = useState(defaultQuantity);
    const [count, setCount] = useState(1);
    const [step, setStep] = useState<Step>('form');
    const [batches, setBatches] = useState<TicketBatch[]>([]);
    const [generating, setGenerating] = useState(false);
    const [removed, setRemoved] = useState<Set<string>>(new Set());
    const [localGenError, setLocalGenError] = useState<string | null>(null);

    // ── ADR-028 §6: Seletor de NFT de desconto ───────────────────────────────
    const [eligibleNfts,   setEligibleNfts]   = useState<EligibleDiscountNft[]>([]);
    const [selectedNftId,  setSelectedNftId]  = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        async function loadNfts() {
            try {
                const { nfts } = await fetchEligibleDiscountNfts();
                if (cancelled) return;
                const filtered = nftTemplateAllowlist && nftTemplateAllowlist.length > 0
                    ? nfts.filter(n => nftTemplateAllowlist.includes(n.template_id))
                    : nfts;
                setEligibleNfts(filtered);
                // default = melhor desconto (já vem ordenado desc da API)
                setSelectedNftId(filtered[0]?.asset_id ?? null);
            } catch {
                // falha silenciosa — seletor simplesmente não aparece
            }
        }
        loadNfts();
        return () => { cancelled = true; };
    }, [session, nftTemplateAllowlist]);

    // ── ADR-021: Seletor de moeda ─────────────────────────────────────────────
    const roomSymbol   = extractSymbol(ticketPrice.quantity);
    const roomContract = ticketPrice.contract;

    const [altTokens,    setAltTokens]    = useState<AltToken[]>([]);
    const [selectedAlt,  setSelectedAlt]  = useState<AltToken | null>(null);
    const [swapQuote,    setSwapQuote]    = useState<SwapQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError,   setQuoteError]   = useState<string | null>(null);
    const quoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Carrega pools e filtra tokens alternativos com saldo > 0
    useEffect(() => {
        let cancelled = false;
        async function load() {
            try {
                const pools = await fetchSwapPools();
                const wallet = String(session.actor);
                const alts: AltToken[] = [];
                for (const pool of pools) {
                    const alt = getAlternativeToken(pool, roomContract, roomSymbol);
                    if (!alt) continue;
                    // evita duplicatas (caso haja múltiplos pools com o mesmo token)
                    if (alts.some(a => a.contract === alt.contract && a.symbol === alt.symbol)) continue;
                    const balance = await fetchTokenBalance(wallet, alt.contract, alt.symbol);
                    if (balance > 0n) {
                        alts.push({ ...alt, poolId: pool.pool_id, balance });
                    }
                }
                if (!cancelled) setAltTokens(alts);
            } catch {
                // falha silenciosa — seletor simplesmente não aparece
            }
        }
        load();
        return () => { cancelled = true; };
    }, [session, roomContract, roomSymbol]);

    // Debounce de cotação estimada ao selecionar moeda alternativa
    useEffect(() => {
        if (!selectedAlt) {
            setSwapQuote(null);
            setQuoteError(null);
            return;
        }
        if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current);
        quoteTimerRef.current = setTimeout(async () => {
            await refreshQuote(selectedAlt);
        }, 400);
        return () => { if (quoteTimerRef.current) clearTimeout(quoteTimerRef.current); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selectedAlt, customPrice, count]);

    async function refreshQuote(alt: AltToken): Promise<SwapQuote | null> {
        const priceNum    = parseFloat(customPrice.split(' ')[0] || '0');
        const totalCost   = priceNum * count;
        if (totalCost <= 0) return null;

        // Extrai precisão da moeda da sala
        const roomPrec = (() => {
            const q = customPrice.split(' ')[0] ?? '';
            const dot = q.indexOf('.');
            return dot >= 0 ? q.length - dot - 1 : 0;
        })();
        const amountOut = toMinUnits(`${totalCost.toFixed(roomPrec)} ${roomSymbol}`, roomPrec);

        setQuoteLoading(true);
        setQuoteError(null);
        try {
            const q = await fetchSwapQuote({
                fromContract: alt.contract,
                fromSymbol:   `${alt.precision},${alt.symbol}`,
                toContract:   roomContract,
                toSymbol:     `${roomPrec},${roomSymbol}`,
                amountOut:    amountOut.toString(),
                gameEndTime,
            });
            setSwapQuote(q);
            return q;
        } catch (err) {
            setQuoteError(err instanceof Error ? err.message : String(err));
            setSwapQuote(null);
            return null;
        } finally {
            setQuoteLoading(false);
        }
    }

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

    const MAX_UX_UNLIMITED = 200;
    const maxLocal = maxTicketsPerPlayer !== undefined && maxTicketsPerPlayer !== null && maxTicketsPerPlayer > 0
        ? maxTicketsPerPlayer
        : maxTicketsPerPlayer === 0
        ? MAX_UX_UNLIMITED
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
            const tickets = await generateForPreview(gameId, count, selectedNftId ?? undefined);
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

    const setPurchaseErrorRaw = (msg: string) => {
        setLocalGenError(msg);
        setTimeout(() => setLocalGenError(null), 5000);
    };

    const handleRemoveTicket = (batchId: string, idx: number) => {
        setRemoved(prev => {
            const next = new Set(prev);
            next.add(`${batchId}:${idx}`);
            return next;
        });
    };

    const handleBackToForm = () => setStep('form');

    // ── Confirmar compra ───────────────────────────────────────────────────
    const handleBuy = async () => {
        clearError();
        const avail = availableTickets();
        if (avail.length === 0) return;

        const priceMap = new Map<string, PurchaseGroup>();
        for (const item of avail) {
            const key = `${item.price.quantity}|${item.price.contract}`;
            if (!priceMap.has(key)) {
                priceMap.set(key, { tickets: [], price: item.price });
            }
            priceMap.get(key)!.tickets.push(item.ticket);
        }
        const groups = Array.from(priceMap.values());

        // ADR-021: se moeda alternativa selecionada, busca cotação final e constrói swapAction
        let swapAction: SwapAction | undefined;
        if (selectedAlt) {
            const finalQuote = await refreshQuote(selectedAlt);
            if (!finalQuote) return; // erro já exibido pelo refreshQuote
            swapAction = {
                fromContract: selectedAlt.contract,
                amountIn:     finalQuote.amount_in_display,
                minOut:       finalQuote.min_out,
                poolId:       finalQuote.pool_id,
                toContract:   roomContract,
                amountOut:    finalQuote.amount_out_display,
            };
        }

        const result = await purchaseTickets(session, gameId, groups, swapAction, selectedNftId ?? undefined);
        if (result) onSuccess();
    };

    // ── Totais ─────────────────────────────────────────────────────────────
    const avail        = availableTickets();
    const totalCount   = avail.length;
    const totalPrice   = avail.reduce((sum, item) => sum + parseFloat(item.price.quantity.split(' ')[0] || '0'), 0);
    const totalSymbol  = customPrice.split(' ')[1] || 'BINGO';
    const totalDisplay = `${totalPrice.toFixed(4)} ${totalSymbol}`;

    const currentPriceAmount = parseFloat(customPrice.split(' ')[0] || '0');
    const currentCostDisplay = `${(currentPriceAmount * count).toFixed(4)} ${customPrice.split(' ')[1] || totalSymbol}`;

    // Expiração da cotação ativa (countdown)
    const quoteSecsLeft = swapQuote ? swapQuote.expires_at - Math.floor(Date.now() / 1000) : 0;
    const quoteExpired  = swapQuote && quoteSecsLeft <= 0;

    // ── Tela de sucesso ────────────────────────────────────────────────────
    if (lastPurchase) {
        return (
            <Dialog open onOpenChange={(open) => !open && onClose()}>
                <DialogContent className="max-w-[44rem]" showCloseButton={false}>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <PartyPopper className="size-4 shrink-0" />
                            {t('buy_ticket.success_title')}
                        </DialogTitle>
                        <DialogClose render={<Button variant="ghost" size="icon" className="absolute top-3 right-3" />} onClick={onClose}>
                            <X className="size-4 shrink-0" />
                            <span className="sr-only">{t('common.close')}</span>
                        </DialogClose>
                    </DialogHeader>

                    <div className="cb-alert cb-alert-success mb-4">
                        <Check className="size-4 shrink-0" />
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
                            <Link2 className="size-4 shrink-0" />
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

                    <Button variant="default" className="rounded-full w-full mt-5" onClick={onClose}>
                        {t('buy_ticket.close')}
                    </Button>
                </DialogContent>
            </Dialog>
        );
    }

    // ── Tela principal ─────────────────────────────────────────────────────
    return (
        <Dialog open onOpenChange={(open) => !open && onClose()}>
            <DialogContent
                data-testid="buy-modal"
                className={step === 'preview' ? 'max-w-[44rem]' : 'max-w-[26rem]'}
                showCloseButton={false}
            >
                {/* ── Header ─────────────────────────────────────────────── */}
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <Dices className="size-4 shrink-0" />
                        {step === 'preview' ? t('buy_ticket.preview_title') : t('buy_ticket.title')}
                    </DialogTitle>
                    <DialogClose
                        render={
                            <Button
                                variant="ghost"
                                size="icon"
                                className="absolute top-3 right-3"
                                data-testid="buy-modal-close"
                                disabled={isPurchasing || generating}
                                aria-label={t('common.close')}
                            />
                        }
                    >
                        <X className="size-4 shrink-0" />
                    </DialogClose>
                </DialogHeader>

                <div className="flex items-center gap-2 flex-wrap mb-5">
                    <span className="text-sm text-[--cb-text-secondary]">
                        {t('game_room.breadcrumb_room')} <span className="font-bold text-[--cb-text-primary]">#{gameId}</span>
                    </span>
                    {!isClosed && (
                        <span className={`lobby-card-ticker${isUrgent ? ' is-urgent' : ''}`}>
                            ⏱ {t('buy_ticket.closes_in', { time: fmtCountdown(remaining) })}
                        </span>
                    )}
                    {isClosed && (
                        <span className="lobby-card-ticker is-urgent">
                            {t('buy_ticket.sales_closed')}
                        </span>
                    )}
                    {maxTicketsPerPlayer && maxTicketsPerPlayer > 0 && (
                        <span className="text-xs text-[--cb-text-tertiary]">
                            {t('buy_ticket.room_limit_info', { max: maxTicketsPerPlayer })}
                        </span>
                    )}
                </div>

                {/* ── Step: FORM ──────────────────────────────────────────── */}
                {step === 'form' && (
                    <>
                        {/* ADR-028 §6: Seletor de NFT de desconto */}
                        {eligibleNfts.length > 0 && (
                            <fieldset className="mb-5" data-testid="nft-discount-selector">
                                <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-2">
                                    {t('buy_ticket.nft_discount_label')}
                                </legend>
                                <div className="flex gap-2 flex-wrap" role="group">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={!selectedNftId ? 'default' : 'ghost'}
                                        className="rounded-full"
                                        onClick={() => setSelectedNftId(null)}
                                        disabled={batches.length > 0}
                                        aria-pressed={!selectedNftId}
                                        data-testid="nft-discount-none"
                                    >
                                        {t('buy_ticket.nft_discount_none')}
                                    </Button>
                                    {eligibleNfts.map(nft => (
                                        <Button
                                            key={nft.asset_id}
                                            type="button"
                                            size="sm"
                                            variant={selectedNftId === nft.asset_id ? 'default' : 'ghost'}
                                            className="rounded-full"
                                            onClick={() => setSelectedNftId(nft.asset_id)}
                                            disabled={batches.length > 0}
                                            aria-pressed={selectedNftId === nft.asset_id}
                                            data-testid={`nft-discount-${nft.asset_id}`}
                                            title={`#${nft.asset_id}`}
                                        >
                                            {nft.value_origin === 0
                                                ? t('buy_ticket.nft_discount_pct', { pct: nft.discount_pct.toFixed(nft.discount_pct % 1 === 0 ? 0 : 2) })
                                                : t('buy_ticket.nft_discount_variable')}
                                        </Button>
                                    ))}
                                </div>
                                {batches.length > 0 && (
                                    <p className="text-xs text-[--cb-text-tertiary] mt-1">
                                        {t('buy_ticket.nft_discount_locked')}
                                    </p>
                                )}
                            </fieldset>
                        )}

                        {/* ADR-021: Seletor de moeda (só aparece quando há alternativas com saldo) */}
                        {altTokens.length > 0 && (
                            <fieldset className="mb-5" data-testid="swap-currency-selector">
                                <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-2">
                                    {t('buy_ticket.swap_currency_label')}
                                </legend>
                                <div className="flex gap-2 flex-wrap">
                                    {/* opção padrão: moeda da sala */}
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={!selectedAlt ? 'default' : 'ghost'}
                                        className="rounded-full"
                                        onClick={() => setSelectedAlt(null)}
                                        data-testid="swap-currency-room"
                                    >
                                        {roomSymbol}
                                    </Button>
                                    {altTokens.map(alt => (
                                        <Button
                                            key={`${alt.contract}:${alt.symbol}`}
                                            type="button"
                                            size="sm"
                                            variant={selectedAlt?.symbol === alt.symbol && selectedAlt?.contract === alt.contract ? 'default' : 'ghost'}
                                            className="rounded-full"
                                            onClick={() => setSelectedAlt(alt)}
                                            data-testid={`swap-currency-${alt.symbol}`}
                                        >
                                            {alt.symbol}
                                        </Button>
                                    ))}
                                </div>

                                {/* Cotação estimada */}
                                {selectedAlt && (
                                    <div
                                        className="mt-3 rounded-xl border border-[--cb-border-default] bg-[--cb-bg-sunken] p-3 text-sm space-y-1"
                                        data-testid="swap-quote-box"
                                    >
                                        {quoteLoading && (
                                            <p className="text-[--cb-text-tertiary] animate-pulse">
                                                {t('buy_ticket.swap_quote_loading')}
                                            </p>
                                        )}
                                        {quoteError && !quoteLoading && (
                                            <p className="text-red-500 text-xs">{quoteError}</p>
                                        )}
                                        {swapQuote && !quoteLoading && !quoteExpired && (
                                            <>
                                                <div className="flex justify-between">
                                                    <span className="text-[--cb-text-secondary]">{t('buy_ticket.swap_you_send')}</span>
                                                    <span className="font-mono font-semibold text-[--cb-brand]">{swapQuote.amount_in_display}</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                                    <span>{t('buy_ticket.swap_service_fee')}</span>
                                                    <span>{(swapQuote.service_fee_bps / 100).toFixed(2)}% + LP {(swapQuote.fee_bps / 100).toFixed(2)}%</span>
                                                </div>
                                                <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                                    <span>{t('buy_ticket.swap_price_impact')}</span>
                                                    <span className={swapQuote.price_impact_pct > 2 ? 'text-orange-400' : ''}>
                                                        {swapQuote.price_impact_pct.toFixed(2)}%
                                                    </span>
                                                </div>
                                                <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                                    <span>{t('buy_ticket.swap_quote_expires')}</span>
                                                    <span>{fmtCountdown(quoteSecsLeft * 1000)}</span>
                                                </div>
                                            </>
                                        )}
                                        {quoteExpired && !quoteLoading && (
                                            <p className="text-orange-400 text-xs">{t('buy_ticket.swap_quote_expired')}</p>
                                        )}
                                    </div>
                                )}
                            </fieldset>
                        )}

                        <fieldset className="mb-5">
                            <legend className="block text-sm font-semibold text-[--cb-text-primary] mb-3">
                                {batches.length > 0
                                    ? t('buy_ticket.add_more_label')
                                    : t('buy_ticket.quantity_label')}
                            </legend>
                            <div className="flex items-center justify-center gap-4">
                                <Button
                                    variant="outline"
                                    className="w-11 h-11 p-0 text-xl rounded-full"
                                    onClick={() => setCount(c => Math.max(1, c - 1))}
                                    disabled={generating || count <= 1}
                                    aria-label={t('buy_ticket.decrease_aria')}
                                >−</Button>
                                <span
                                    className="text-3xl font-black text-[--cb-text-primary] min-w-[3rem] text-center tabular-nums"
                                    aria-live="polite"
                                    data-testid="buy-count"
                                >{count}</span>
                                <Button
                                    variant="outline"
                                    className="w-11 h-11 p-0 text-xl rounded-full"
                                    onClick={() => setCount(c => Math.min(maxLocal, c + 1))}
                                    disabled={generating || count >= maxLocal}
                                    aria-label={t('buy_ticket.increase_aria')}
                                >+</Button>
                            </div>
                            <div className="flex justify-center gap-2 mt-3 flex-wrap">
                                {[1, 3, 5, Math.min(10, maxLocal)].map(n => (
                                    <Button
                                        key={n}
                                        size="sm"
                                        variant="ghost"
                                        className="rounded-full tabular-nums"
                                        onClick={() => setCount(c => Math.min(maxLocal, c + n))}
                                        disabled={generating || count >= maxLocal}
                                    >+{n}</Button>
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
                                    data-testid="buy-price"
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
                            {selectedAlt && swapQuote
                                ? t('buy_ticket.swap_cost_preview', {
                                    roomTotal: currentCostDisplay,
                                    altAmount: swapQuote.amount_in_display,
                                  })
                                : t('buy_ticket.cost_preview', { total: currentCostDisplay })}
                        </p>

                        <div className="flex gap-3">
                            {batches.length > 0 && (
                                <Button
                                    variant="ghost"
                                    className="flex-1"
                                    onClick={() => setStep('preview')}
                                    disabled={generating}
                                >
                                    {t('buy_ticket.back_to_preview')}
                                </Button>
                            )}
                            <Button
                                variant="default"
                                className={batches.length > 0 ? 'flex-1' : 'w-full'}
                                onClick={handleGenerate}
                                disabled={generating || count < 1 || !!priceError}
                                aria-busy={generating}
                                data-testid="buy-preview"
                            >
                                {generating
                                    ? t('buy_ticket.generating')
                                    : batches.length > 0
                                        ? t('buy_ticket.add_more_btn')
                                        : t('buy_ticket.generate_btn')}
                            </Button>
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
                                {/* ADR-021: resumo do swap se moeda alternativa */}
                                {selectedAlt && swapQuote && !quoteExpired && (
                                    <div
                                        className="border-t border-[--cb-border-default] pt-2 mt-2 text-xs space-y-1"
                                        data-testid="swap-preview-summary"
                                    >
                                        <div className="flex justify-between text-[--cb-text-secondary]">
                                            <span>{t('buy_ticket.swap_via')}</span>
                                            <span className="font-semibold">{selectedAlt.symbol} → {roomSymbol}</span>
                                        </div>
                                        <div className="flex justify-between">
                                            <span className="text-[--cb-text-tertiary]">{t('buy_ticket.swap_you_send')}</span>
                                            <span className="font-mono font-bold text-[--cb-brand]">{swapQuote.amount_in_display}</span>
                                        </div>
                                        <div className="flex justify-between text-[--cb-text-tertiary]">
                                            <span>{t('buy_ticket.swap_quote_expires')}</span>
                                            <span>{fmtCountdown(quoteSecsLeft * 1000)}</span>
                                        </div>
                                    </div>
                                )}
                                {selectedAlt && quoteExpired && (
                                    <p className="text-orange-400 text-xs mt-1">{t('buy_ticket.swap_quote_expired')}</p>
                                )}
                            </div>
                        )}

                        {(purchaseError || localGenError) && (
                            <div className="cb-alert cb-alert-error mb-4" role="alert" data-testid="buy-error">
                                <TriangleAlert className="size-4 shrink-0" />
                                <span>{purchaseError || localGenError}</span>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <Button
                                variant="ghost"
                                className="flex-1"
                                onClick={handleBackToForm}
                                disabled={isPurchasing || generating}
                            >
                                {t('buy_ticket.generate_more')}
                            </Button>
                            <Button
                                variant="default"
                                className="flex-[2]"
                                onClick={handleBuy}
                                disabled={isPurchasing || generating || totalCount === 0}
                                aria-busy={isPurchasing}
                                data-testid="buy-confirm"
                            >
                                {isPurchasing
                                    ? t('buy_ticket.processing')
                                    : t('buy_ticket.confirm_buy_count', { count: totalCount })}
                            </Button>
                        </div>
                    </>
                )}

                <p className="text-xs text-center text-[--cb-text-tertiary] mt-3">
                    {t('buy_ticket.debited_from')}{' '}
                    <span className="font-mono">bingogamectr</span>
                </p>
            </DialogContent>
        </Dialog>
    );
}
