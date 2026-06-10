// apps/swap-ui/src/pages/PoolPage.tsx
// ADR-022 — gestão de liquidez do bingo.swap.
// Fluxo: visualizar posições LP → adicionar (2 depósitos atômicos) → remover (slider) → cancelar dep pendente.

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { SwapPoolSummary } from '@cryptobingo/shared-types';
import { useWallet } from '../hooks/useWallet';
import {
    fetchSwapPools,
    fetchUserLpPositions,
    fetchPendingDeposits,
    fetchTokenBalance,
    executeAddLiquidity,
    executeRemoveLiquidity,
    executeCancelDeposit,
    type LpPosition,
    type PendingDeposit,
} from '../services/swapService';

function formatAsset(raw: bigint, precision: number, symbol: string): string {
    if (precision === 0) return `${raw} ${symbol}`;
    const s   = raw.toString().padStart(precision + 1, '0');
    const pos = s.length - precision;
    return `${s.slice(0, pos)}.${s.slice(pos)} ${symbol}`;
}

function parseAmount(value: string, precision: number): bigint {
    const [w = '0', f = ''] = value.split('.');
    const frac = f.slice(0, precision).padEnd(precision, '0');
    return BigInt(w + frac);
}

export default function PoolPage() {
    const { t } = useTranslation();
    const { session, connect } = useWallet();

    const [pools,       setPools]       = useState<SwapPoolSummary[]>([]);
    const [positions,   setPositions]   = useState<LpPosition[]>([]);
    const [pendingDeps, setPendingDeps] = useState<PendingDeposit[]>([]);
    const [loading,     setLoading]     = useState(false);

    // formulário add liquidity
    const [selectedPool, setSelectedPool] = useState<SwapPoolSummary | null>(null);
    const [amountA,      setAmountA]      = useState('');
    const [amountB,      setAmountB]      = useState('');
    const [addPending,   setAddPending]   = useState(false);
    const [addSuccess,   setAddSuccess]   = useState(false);
    const [addError,     setAddError]     = useState<string | null>(null);

    // remove liquidity
    const [removePct,    setRemovePct]    = useState(100);
    const [removePending, setRemovePending] = useState(false);
    const [removeSuccess, setRemoveSuccess] = useState(false);
    const [removeError,   setRemoveError]   = useState<string | null>(null);

    // cancel deposit
    const [cancelPending, setCancelPending] = useState<number | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [ps] = await Promise.all([fetchSwapPools()]);
            setPools(ps);
            if (session) {
                const actor = String(session.actor);
                const [pos, deps] = await Promise.all([
                    fetchUserLpPositions(actor),
                    fetchPendingDeposits(actor),
                ]);
                setPositions(pos);
                setPendingDeps(deps);
            }
        } catch {
            // silencia erros de rede — estado anterior permanece
        } finally {
            setLoading(false);
        }
    }, [session]);

    useEffect(() => { load(); }, [load]);

    const handleAddLiquidity = async () => {
        if (!session || !selectedPool) return;
        const aAmt = parseAmount(amountA, selectedPool.token_a.precision);
        const bAmt = parseAmount(amountB, selectedPool.token_b.precision);
        if (aAmt <= 0n || bAmt <= 0n) return;

        const symA = selectedPool.token_a.symbol.split(',')[1] ?? '';
        const symB = selectedPool.token_b.symbol.split(',')[1] ?? '';

        setAddPending(true); setAddError(null); setAddSuccess(false);
        try {
            await executeAddLiquidity(session, {
                poolId:    Number(selectedPool.pool_id),
                amountA:   formatAsset(aAmt, selectedPool.token_a.precision, symA),
                contractA: selectedPool.token_a.contract,
                amountB:   formatAsset(bAmt, selectedPool.token_b.precision, symB),
                contractB: selectedPool.token_b.contract,
            });
            setAddSuccess(true);
            setAmountA(''); setAmountB('');
            await load();
        } catch (e: unknown) {
            setAddError(e instanceof Error ? e.message : 'erro');
        } finally {
            setAddPending(false);
        }
    };

    const handleRemoveLiquidity = async (pos: LpPosition) => {
        if (!session) return;
        setRemovePending(true); setRemoveError(null); setRemoveSuccess(false);
        try {
            const precision = 4;
            await executeRemoveLiquidity(session, {
                poolId:      pos.pool_id,
                lpSymbol:    pos.lp_symbol,
                lpPrecision: precision,
                pctBps:      removePct * 100,
                lpAmount:    pos.lp_amount,
            });
            setRemoveSuccess(true);
            await load();
        } catch (e: unknown) {
            setRemoveError(e instanceof Error ? e.message : 'erro');
        } finally {
            setRemovePending(false);
        }
    };

    const handleCancelDeposit = async (poolId: number) => {
        if (!session) return;
        setCancelPending(poolId);
        try {
            await executeCancelDeposit(session, poolId);
            await load();
        } catch {
            // erro silencioso — estado recarregado
        } finally {
            setCancelPending(null);
        }
    };

    if (!session) {
        return (
            <div className="cb-container py-16 text-center">
                <p className="cb-muted mb-4">{t('pool.connect_to_manage')}</p>
                <button className="cb-btn cb-btn-primary" onClick={connect} data-testid="pool-connect-btn">
                    {t('common.connect_wallet')}
                </button>
            </div>
        );
    }

    return (
        <div className="cb-container py-10 max-w-2xl mx-auto space-y-8">

            {/* Posições LP */}
            <section>
                <h2 className="text-lg font-semibold mb-3">{t('pool.your_positions')}</h2>
                {loading && <p className="cb-hint">{t('common.loading')}</p>}
                {!loading && positions.length === 0 && (
                    <p className="cb-hint" data-testid="pool-no-positions">{t('pool.no_positions')}</p>
                )}
                {positions.map(pos => (
                    <div key={pos.pool_id} className="cb-card mb-3 p-4" data-testid={`lp-position-${pos.pool_id}`}>
                        <div className="flex justify-between items-start">
                            <div>
                                <p className="font-mono text-sm">Pool #{pos.pool_id}</p>
                                <p className="cb-muted text-xs">
                                    {t('pool.lp_balance', {
                                        amount: formatAsset(pos.lp_amount, 4, pos.lp_symbol),
                                    })}
                                </p>
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    type="range"
                                    min={1}
                                    max={100}
                                    value={removePct}
                                    onChange={e => setRemovePct(Number(e.target.value))}
                                    className="w-24"
                                    data-testid={`remliq-slider-${pos.pool_id}`}
                                />
                                <button
                                    className="cb-btn cb-btn-sm cb-btn-danger"
                                    disabled={removePending}
                                    aria-busy={removePending}
                                    onClick={() => handleRemoveLiquidity(pos)}
                                    data-testid={`remliq-btn-${pos.pool_id}`}
                                >
                                    {removePending
                                        ? t('pool.remliq_processing')
                                        : t('pool.remliq_btn', { pct: removePct })}
                                </button>
                            </div>
                        </div>
                        {removeSuccess && <p className="cb-hint text-[--cb-success] mt-1">{t('pool.success_remove')}</p>}
                        {removeError  && <p className="cb-hint text-[--cb-danger]  mt-1">{removeError}</p>}
                    </div>
                ))}
            </section>

            {/* Depósitos pendentes */}
            {pendingDeps.length > 0 && (
                <section>
                    <h2 className="text-lg font-semibold mb-3">{t('pool.cancel_deposit')}</h2>
                    {pendingDeps.map(dep => (
                        <div key={dep.pool_id} className="cb-card mb-2 p-3 flex justify-between items-center"
                             data-testid={`pending-dep-${dep.pool_id}`}>
                            <div className="text-sm">
                                <span className="font-mono">Pool #{dep.pool_id}</span>
                                &nbsp;— {dep.amount_a} / {dep.amount_b}
                            </div>
                            <button
                                className="cb-btn cb-btn-sm cb-btn-ghost"
                                disabled={cancelPending === dep.pool_id}
                                onClick={() => handleCancelDeposit(dep.pool_id)}
                                data-testid={`cancel-dep-btn-${dep.pool_id}`}
                            >
                                {cancelPending === dep.pool_id ? t('common.loading') : t('pool.cancel_deposit')}
                            </button>
                        </div>
                    ))}
                </section>
            )}

            {/* Adicionar liquidez */}
            <section>
                <h2 className="text-lg font-semibold mb-3">{t('pool.add_liquidity')}</h2>
                <div className="cb-card p-4 space-y-4">

                    {/* Seletor de pool */}
                    <div>
                        <label className="cb-form-label">Pool</label>
                        <select
                            className="cb-input w-full"
                            value={selectedPool?.pool_id ?? ''}
                            onChange={e => {
                                const p = pools.find(x => x.pool_id === e.target.value) ?? null;
                                setSelectedPool(p);
                                setAmountA(''); setAmountB('');
                            }}
                            data-testid="addliq-pool-select"
                        >
                            <option value="">{t('swap.select_token')}</option>
                            {pools.map(p => (
                                <option key={p.pool_id} value={p.pool_id}>
                                    Pool #{p.pool_id} — {p.token_a.symbol.split(',')[1]}/{p.token_b.symbol.split(',')[1]}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedPool && (
                        <>
                            <div>
                                <label className="cb-form-label">
                                    {selectedPool.token_a.symbol.split(',')[1]}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    className="cb-input w-full"
                                    placeholder="0.0"
                                    value={amountA}
                                    onChange={e => setAmountA(e.target.value)}
                                    data-testid="addliq-amount-a"
                                />
                            </div>
                            <div>
                                <label className="cb-form-label">
                                    {selectedPool.token_b.symbol.split(',')[1]}
                                </label>
                                <input
                                    type="number"
                                    min="0"
                                    step="any"
                                    className="cb-input w-full"
                                    placeholder="0.0"
                                    value={amountB}
                                    onChange={e => setAmountB(e.target.value)}
                                    data-testid="addliq-amount-b"
                                />
                            </div>

                            {addSuccess && (
                                <p className="cb-hint text-[--cb-success]" data-testid="addliq-success">
                                    {t('pool.success_add')}
                                </p>
                            )}
                            {addError && (
                                <p className="cb-hint text-[--cb-danger]" data-testid="addliq-error">
                                    {addError}
                                </p>
                            )}

                            <button
                                className="cb-btn cb-btn-primary w-full"
                                onClick={handleAddLiquidity}
                                disabled={addPending || !amountA || !amountB}
                                aria-busy={addPending}
                                data-testid="addliq-submit"
                            >
                                {addPending ? t('pool.addliq_processing') : t('pool.addliq_btn')}
                            </button>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}
