// apps/swap-ui/src/pages/SwapPage.tsx
// ADR-022 — interface de swap do bingo.swap DEX público.
// Fluxo: usuário escolhe par → digita amount_out → recebe cotação → executa on-chain.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SwapPoolSummary, SwapQuote } from '@cryptobingo/shared-types';
import { useWallet } from '../hooks/useWallet';
import {
    fetchSwapPools,
    fetchSwapQuote,
    fetchTokenBalance,
    executeSwap,
} from '../services/swapService';

interface TokenOption {
    contract:  string;
    symbol:    string;
    precision: number;
    poolId:    string;
    pairLabel: string;   // "BINGO → WAX"
    pool:      SwapPoolSummary;
}

function formatAmount(raw: bigint, precision: number): string {
    if (precision === 0) return raw.toString();
    const s   = raw.toString().padStart(precision + 1, '0');
    const pos = s.length - precision;
    return `${s.slice(0, pos)}.${s.slice(pos)}`;
}

export default function SwapPage() {
    const { t } = useTranslation();
    const { session, connect } = useWallet();

    const [pools,        setPools]        = useState<SwapPoolSummary[]>([]);
    const [tokens,       setTokens]       = useState<TokenOption[]>([]);
    const [fromIdx,      setFromIdx]      = useState(0);  // índice em `tokens`
    const [toIdx,        setToIdx]        = useState(1);
    const [amountOut,    setAmountOut]    = useState('');
    const [balance,      setBalance]      = useState<bigint>(0n);
    const [quote,        setQuote]        = useState<SwapQuote | null>(null);
    const [quoteLoading, setQuoteLoading] = useState(false);
    const [quoteError,   setQuoteError]   = useState<string | null>(null);
    const [txPending,    setTxPending]    = useState(false);
    const [txSuccess,    setTxSuccess]    = useState(false);
    const [txError,      setTxError]      = useState<string | null>(null);
    const [countdown,    setCountdown]    = useState(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // carrega pools e monta lista de tokens disponíveis
    useEffect(() => {
        fetchSwapPools().then(ps => {
            setPools(ps);
            const opts: TokenOption[] = [];
            for (const p of ps) {
                opts.push({
                    contract:  p.token_a.contract,
                    symbol:    p.token_a.symbol,
                    precision: p.token_a.precision,
                    poolId:    p.pool_id,
                    pairLabel: `${p.token_a.symbol.split(',')[1]} → ${p.token_b.symbol.split(',')[1]}`,
                    pool:      p,
                });
                opts.push({
                    contract:  p.token_b.contract,
                    symbol:    p.token_b.symbol,
                    precision: p.token_b.precision,
                    poolId:    p.pool_id,
                    pairLabel: `${p.token_b.symbol.split(',')[1]} → ${p.token_a.symbol.split(',')[1]}`,
                    pool:      p,
                });
            }
            setTokens(opts);
        }).catch(() => {});
    }, []);

    // lê saldo do token de origem sempre que conta ou token mudar
    useEffect(() => {
        if (!session || tokens.length === 0) { setBalance(0n); return; }
        const from = tokens[fromIdx];
        if (!from) return;
        fetchTokenBalance(
            String(session.actor),
            from.contract,
            from.symbol.split(',')[1] ?? '',
        ).then(setBalance).catch(() => setBalance(0n));
    }, [session, tokens, fromIdx]);

    // countdown do quote
    useEffect(() => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (!quote) return;
        const update = () => {
            const left = Math.max(0, quote.expires_at - Math.floor(Date.now() / 1000));
            setCountdown(left);
            if (left === 0 && timerRef.current) clearInterval(timerRef.current);
        };
        update();
        timerRef.current = setInterval(update, 1000);
        return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }, [quote]);

    const refreshQuote = useCallback(async () => {
        if (tokens.length === 0) return;
        const from = tokens[fromIdx];
        const to   = tokens[toIdx];
        if (!from || !to || from.poolId !== to.poolId) {
            setQuote(null); setQuoteError(null); return;
        }
        const parsed = parseFloat(amountOut);
        if (!amountOut || isNaN(parsed) || parsed <= 0) {
            setQuote(null); setQuoteError(null); return;
        }
        const rawOut = Math.round(parsed * 10 ** to.precision).toString();
        setQuoteLoading(true); setQuoteError(null);
        try {
            const q = await fetchSwapQuote({
                fromContract: from.contract,
                fromSymbol:   from.symbol,
                toContract:   to.contract,
                toSymbol:     to.symbol,
                amountOut:    rawOut,
            });
            setQuote(q);
        } catch (e: unknown) {
            setQuote(null);
            setQuoteError(e instanceof Error ? e.message : 'erro');
        } finally {
            setQuoteLoading(false);
        }
    }, [tokens, fromIdx, toIdx, amountOut]);

    // debounce 400ms ao digitar
    useEffect(() => {
        const id = setTimeout(refreshQuote, 400);
        return () => clearTimeout(id);
    }, [refreshQuote]);

    const handleSwap = async () => {
        if (!session || !quote) return;
        const from = tokens[fromIdx];
        if (!from) return;

        if (countdown === 0) { await refreshQuote(); return; }

        setTxPending(true); setTxError(null); setTxSuccess(false);
        try {
            await executeSwap(session, {
                fromContract: from.contract,
                amountIn:     quote.amount_in_display,
                minOut:       formatAmount(BigInt(quote.min_out), tokens[toIdx]?.precision ?? 4)
                              + ' ' + (tokens[toIdx]?.symbol.split(',')[1] ?? ''),
                poolId:       Number(quote.pool_id),
                toContract:   tokens[toIdx]?.contract ?? '',
            });
            setTxSuccess(true);
            setAmountOut('');
            setQuote(null);
        } catch (e: unknown) {
            const msg = e instanceof Error ? e.message : 'erro';
            if (msg.includes('min_out')) {
                setTxError(t('swap.error_slippage') ?? 'Slippage excedido — tente novamente.');
            } else {
                setTxError(t('swap.error_generic', { msg }) ?? msg);
            }
        } finally {
            setTxPending(false);
        }
    };

    const fromToken = tokens[fromIdx];
    const toToken   = tokens[toIdx];
    const highImpact = quote && quote.price_impact_pct > 2;

    const balanceDisplay = fromToken
        ? formatAmount(balance, fromToken.precision) + ' ' + (fromToken.symbol.split(',')[1] ?? '')
        : '';

    return (
        <div className="cb-container py-10 max-w-lg mx-auto">
            <div className="cb-card">
                <h1 className="cb-card-title">{t('swap.title')}</h1>

                {/* Seletor de par */}
                <div className="flex gap-2 mb-4">
                    <div className="flex-1">
                        <label className="cb-form-label">{t('swap.you_pay')}</label>
                        <select
                            className="cb-input w-full"
                            value={fromIdx}
                            onChange={e => { setFromIdx(Number(e.target.value)); setQuote(null); }}
                            data-testid="swap-from-token"
                        >
                            {tokens.map((tk, i) => (
                                <option key={i} value={i}>
                                    {tk.symbol.split(',')[1]} ({tk.contract})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="flex items-end pb-0.5">
                        <button
                            className="cb-btn cb-btn-ghost"
                            onClick={() => { setFromIdx(toIdx); setToIdx(fromIdx); setQuote(null); }}
                            title="Inverter par"
                            data-testid="swap-reverse"
                        >
                            ⇄
                        </button>
                    </div>

                    <div className="flex-1">
                        <label className="cb-form-label">{t('swap.you_receive')}</label>
                        <select
                            className="cb-input w-full"
                            value={toIdx}
                            onChange={e => { setToIdx(Number(e.target.value)); setQuote(null); }}
                            data-testid="swap-to-token"
                        >
                            {tokens.map((tk, i) => (
                                <option key={i} value={i}>
                                    {tk.symbol.split(',')[1]} ({tk.contract})
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Amount out */}
                <div className="mb-4">
                    <label className="cb-form-label">
                        {t('swap.you_receive')} ({toToken?.symbol.split(',')[1] ?? '?'})
                    </label>
                    <input
                        type="number"
                        min="0"
                        step="any"
                        className="cb-input w-full"
                        placeholder={t('swap.amount_placeholder') ?? ''}
                        value={amountOut}
                        onChange={e => { setAmountOut(e.target.value); setTxSuccess(false); }}
                        data-testid="swap-amount-out"
                    />
                    {session && (
                        <p className="text-xs text-[--cb-muted] mt-1">
                            {t('swap.wallet_balance', { amount: balanceDisplay })}
                        </p>
                    )}
                </div>

                {/* Cotação */}
                {quoteLoading && (
                    <p className="cb-hint mb-3" data-testid="swap-quote-loading">
                        {t('swap.get_quote')}…
                    </p>
                )}

                {quoteError && (
                    <p className="cb-hint text-[--cb-danger] mb-3" data-testid="swap-quote-error">
                        {quoteError}
                    </p>
                )}

                {quote && !quoteLoading && (
                    <div className={`cb-card mb-4 p-3 text-sm ${highImpact ? 'border-[--cb-warn]' : ''}`}
                         data-testid="swap-quote-box">
                        <div className="flex justify-between">
                            <span className="cb-muted">{t('swap.you_send')}</span>
                            <span className="font-mono">{quote.amount_in_display}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="cb-muted">{t('swap.fee_lp')}</span>
                            <span>{quote.fee_bps} bps</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="cb-muted">{t('swap.fee_service')}</span>
                            <span>{quote.service_fee_bps} bps</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="cb-muted">{t('swap.price_impact')}</span>
                            <span className={highImpact ? 'text-[--cb-warn] font-bold' : ''}>
                                {quote.price_impact_pct.toFixed(2)}%
                            </span>
                        </div>
                        <div className="flex justify-between">
                            <span className="cb-muted">{t('swap.quote_expires')}</span>
                            <span className={countdown <= 5 ? 'text-[--cb-danger]' : ''}>{countdown}s</span>
                        </div>
                        {highImpact && (
                            <p className="text-[--cb-warn] text-xs mt-1" data-testid="swap-high-impact-warn">
                                {t('swap.slippage_warning')}
                            </p>
                        )}
                    </div>
                )}

                {/* Feedback tx */}
                {txSuccess && (
                    <p className="cb-hint text-[--cb-success] mb-3" data-testid="swap-success">
                        {t('swap.success')}
                    </p>
                )}
                {txError && (
                    <p className="cb-hint text-[--cb-danger] mb-3" data-testid="swap-tx-error">
                        {txError}
                    </p>
                )}

                {/* Botão principal */}
                {!session ? (
                    <button
                        className="cb-btn cb-btn-primary w-full"
                        onClick={connect}
                        data-testid="swap-connect-btn"
                    >
                        {t('swap.connect_to_swap')}
                    </button>
                ) : countdown === 0 && quote ? (
                    <button
                        className="cb-btn cb-btn-outline w-full"
                        onClick={refreshQuote}
                        data-testid="swap-refresh-quote"
                    >
                        {t('swap.refresh_quote')}
                    </button>
                ) : (
                    <button
                        className="cb-btn cb-btn-primary w-full"
                        onClick={handleSwap}
                        disabled={!quote || txPending || quoteLoading}
                        aria-busy={txPending}
                        data-testid="swap-submit"
                    >
                        {txPending ? t('swap.swapping') : t('swap.swap_btn')}
                    </button>
                )}

                {pools.length === 0 && !quoteLoading && (
                    <p className="cb-hint text-center mt-4" data-testid="swap-no-pool">
                        {t('swap.no_pool')}
                    </p>
                )}
            </div>
        </div>
    );
}
