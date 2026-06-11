// apps/frontend/src/components/admin/TokenAdmin.tsx
// Painel administrativo do token BINGO (bingogametkn — padrão eosio.token).
// Abas: Supply (stat global) | Saldos (top holders no contrato bingogamectr) | Operações (issue/retire/transfer)
//
// Leitura: chain.get_table_rows direto via session.client.
// Escrita: session.transact() — somente conta autorizada (issuer).

import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Name } from '@wharfkit/session';
import type { Session } from '@wharfkit/session';

const TOKEN_CONTRACT  = import.meta.env.VITE_BINGO_TOKEN_CONTRACT ?? 'bingogametkn';
const GAME_CONTRACT   = import.meta.env.VITE_CONTRACT_ACCOUNT     ?? 'bingogamectr';
const EXPLORER_URL    = import.meta.env.VITE_EXPLORER_URL         ?? 'https://wax.bloks.io';
const TOKEN_SYMBOL    = 'BINGO';
const TOKEN_PRECISION = 4;

// ── Tipos ─────────────────────────────────────────────────────────────────────

interface TokenStat {
    supply:     string;
    max_supply: string;
    issuer:     string;
}

interface TokenAccount {
    balance: string;
}

interface GameBalance {
    balance: { quantity: string; contract: string };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseAmount(s: string): number {
    return parseFloat(s.split(' ')[0]) || 0;
}

function fmtQty(n: number): string {
    return n.toFixed(TOKEN_PRECISION) + ' ' + TOKEN_SYMBOL;
}

function validateQty(raw: string): string | null {
    const n = parseFloat(raw);
    if (isNaN(n) || n <= 0) return 'Valor inválido';
    const parts = raw.split('.');
    if (parts[1] && parts[1].length > TOKEN_PRECISION) return `Máximo ${TOKEN_PRECISION} casas decimais`;
    return null;
}

// ── Componente ────────────────────────────────────────────────────────────────

interface TokenAdminProps {
    session?: Session;
}

type TabId = 'supply' | 'balances' | 'ops';

export default function TokenAdmin({ session }: TokenAdminProps) {
    const { t } = useTranslation();

    const [tab,     setTab]     = useState<TabId>('supply');
    const [error,   setError]   = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    const actor = session ? String(session.actor) : '';

    const showError = (e: unknown) =>
        setError(e instanceof Error ? e.message : String(e));

    async function transact(actions: object[]): Promise<boolean> {
        if (!session) { setError(t('admin.token_no_session')); return false; }
        try {
            const result = await (session as any).transact({ actions }, { broadcast: true });
            const txId = result?.response?.transaction_id ?? result?.transaction_id ?? '';
            setSuccess(`✓ TX: ${txId ? txId.slice(0, 16) + '...' : 'ok'}`);
            return true;
        } catch (e) { showError(e); return false; }
    }

    // ── SUPPLY ────────────────────────────────────────────────────────────────

    const [stat, setStat] = useState<TokenStat | null>(null);

    const loadStat = useCallback(async () => {
        if (!session) return;
        setLoading(true);
        try {
            const res = await session.client.v1.chain.get_table_rows({
                code: TOKEN_CONTRACT, scope: TOKEN_SYMBOL,
                table: 'stat', limit: 1, json: true,
            });
            setStat((res.rows[0] as TokenStat) ?? null);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, [session]);

    useEffect(() => { if (tab === 'supply') loadStat(); }, [tab, loadStat]);

    // ── SALDOS ────────────────────────────────────────────────────────────────

    // Saldo da conta do contrato bingogamectr no token externo
    const [contractWalletBal, setContractWalletBal] = useState<number | null>(null);
    // Saldo interno agregado (tabela balances do bingogamectr com scope=bingogamectr)
    const [contractGameBal, setContractGameBal]     = useState<number | null>(null);
    // Saldo da carteira do admin
    const [adminWalletBal, setAdminWalletBal]       = useState<number | null>(null);

    const loadBalances = useCallback(async () => {
        if (!session) return;
        setLoading(true);
        try {
            const actorScope = Name.from(session.actor).value.toString();
            const gameScope  = Name.from(GAME_CONTRACT).value.toString();

            const [adminRes, contractTokenRes, contractGameRes] = await Promise.all([
                // Saldo do admin no bingogametkn
                session.client.v1.chain.get_table_rows({
                    code: TOKEN_CONTRACT, scope: actorScope,
                    table: 'accounts', limit: 10, json: true,
                }),
                // Saldo de bingogamectr no bingogametkn (tokens livres na conta)
                session.client.v1.chain.get_table_rows({
                    code: TOKEN_CONTRACT, scope: gameScope,
                    table: 'accounts', limit: 10, json: true,
                }),
                // Soma dos saldos internos dos jogadores (scope = bingogamectr, multi-row)
                session.client.v1.chain.get_table_rows({
                    code: GAME_CONTRACT, scope: GAME_CONTRACT,
                    table: 'balances', limit: 200, json: true,
                }),
            ]);

            const adminBingo = (adminRes.rows as TokenAccount[])
                .find(r => r.balance.endsWith(TOKEN_SYMBOL));
            setAdminWalletBal(adminBingo ? parseAmount(adminBingo.balance) : 0);

            const contractBingo = (contractTokenRes.rows as TokenAccount[])
                .find(r => r.balance.endsWith(TOKEN_SYMBOL));
            setContractWalletBal(contractBingo ? parseAmount(contractBingo.balance) : 0);

            const totalInternal = (contractGameRes.rows as GameBalance[])
                .filter(r => r.balance.quantity.endsWith(TOKEN_SYMBOL))
                .reduce((sum, r) => sum + parseAmount(r.balance.quantity), 0);
            setContractGameBal(totalInternal);
        } catch (e) { showError(e); }
        finally { setLoading(false); }
    }, [session]);

    useEffect(() => { if (tab === 'balances') loadBalances(); }, [tab, loadBalances]);

    // ── OPERAÇÕES ─────────────────────────────────────────────────────────────

    type OpMode = 'issue' | 'retire' | 'transfer';
    const [opMode,  setOpMode]  = useState<OpMode>('issue');
    const [qty,     setQty]     = useState('');
    const [memo,    setMemo]    = useState('');
    const [toAddr,  setToAddr]  = useState('');
    const [qtyErr,  setQtyErr]  = useState<string | null>(null);

    function validateForm(): boolean {
        const err = validateQty(qty);
        setQtyErr(err);
        if (err) return false;
        if (opMode === 'transfer' && !toAddr.trim()) {
            setError(t('admin.token_err_no_recipient'));
            return false;
        }
        return true;
    }

    async function execOp() {
        if (!validateForm()) return;
        setError(null);

        const quantityStr = fmtQty(parseFloat(qty));

        let actions: object[];

        if (opMode === 'issue') {
            actions = [{
                account: TOKEN_CONTRACT,
                name: 'issue',
                authorization: [{ actor, permission: 'active' }],
                data: { to: actor, quantity: quantityStr, memo },
            }];
        } else if (opMode === 'retire') {
            actions = [{
                account: TOKEN_CONTRACT,
                name: 'retire',
                authorization: [{ actor, permission: 'active' }],
                data: { quantity: quantityStr, memo },
            }];
        } else {
            actions = [{
                account: TOKEN_CONTRACT,
                name: 'transfer',
                authorization: [{ actor, permission: 'active' }],
                data: { from: actor, to: toAddr.trim(), quantity: quantityStr, memo },
            }];
        }

        const ok = await transact(actions);
        if (ok) {
            setQty('');
            setMemo('');
            setToAddr('');
            // Recarrega supply se issue/retire
            if (opMode !== 'transfer') loadStat();
        }
    }

    // ── Render ────────────────────────────────────────────────────────────────

    const TABS: { id: TabId; label: string }[] = [
        { id: 'supply',   label: t('admin.token_tab_supply')   },
        { id: 'balances', label: t('admin.token_tab_balances') },
        { id: 'ops',      label: t('admin.token_tab_ops')      },
    ];

    const supplyPct = stat
        ? (parseAmount(stat.supply) / parseAmount(stat.max_supply)) * 100
        : 0;

    return (
        <div>
            {/* Header */}
            <div className="flex items-baseline justify-between mb-1 gap-4">
                <div>
                    <p className="text-sm text-[--cb-text-tertiary]">
                        {t('admin.token_desc')} ·{' '}
                        <span className="font-mono text-[--cb-brand]">{TOKEN_CONTRACT}</span>
                        {' '}·{' '}
                        <span className="font-mono text-[--cb-brand]">{TOKEN_SYMBOL}</span>
                    </p>
                </div>
                <a href={`${EXPLORER_URL}/account/${TOKEN_CONTRACT}`} target="_blank" rel="noreferrer"
                   className="cb-btn cb-btn-ghost cb-btn-sm text-xs" style={{ whiteSpace: 'nowrap' }}>
                    ↗ Explorer
                </a>
            </div>

            {!session && (
                <div className="cb-alert cb-alert-error mb-4">⚠️ {t('admin.token_no_session')}</div>
            )}
            {error && (
                <div className="cb-alert cb-alert-error mb-4 flex items-center gap-2">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}
            {success && (
                <div className="cb-alert cb-alert-success mb-4 flex items-center gap-2">
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            {/* Tab bar */}
            <div className="flex gap-2 mb-6 flex-wrap">
                {TABS.map(tb => (
                    <button key={tb.id}
                        data-testid={`token-tab-${tb.id}`}
                        className={`cb-btn cb-btn-sm ${tab === tb.id ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                        onClick={() => { setTab(tb.id); setError(null); setSuccess(null); }}>
                        {tb.label}
                    </button>
                ))}
            </div>

            {loading && (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" /><span>{t('common.loading')}</span>
                </div>
            )}

            {/* ══════════ SUPPLY ══════════ */}
            {!loading && tab === 'supply' && (
                <div className="space-y-4" style={{ maxWidth: '36rem' }}>
                    {stat ? (
                        <>
                            <div className="cb-card p-5 space-y-4">
                                <div className="flex justify-between items-start">
                                    <div>
                                        <p className="text-xs text-[--cb-text-tertiary] mb-0.5">{t('admin.token_supply_label')}</p>
                                        <p className="text-2xl font-mono font-bold text-[--cb-text-primary]">
                                            {parseAmount(stat.supply).toLocaleString(undefined, { minimumFractionDigits: TOKEN_PRECISION })}
                                        </p>
                                        <p className="text-xs text-[--cb-text-tertiary] mt-0.5">{TOKEN_SYMBOL}</p>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-[--cb-text-tertiary] mb-0.5">{t('admin.token_max_supply_label')}</p>
                                        <p className="text-lg font-mono font-semibold text-[--cb-text-secondary]">
                                            {parseAmount(stat.max_supply).toLocaleString(undefined, { minimumFractionDigits: TOKEN_PRECISION })}
                                        </p>
                                    </div>
                                </div>

                                {/* Barra de progresso supply/max */}
                                <div>
                                    <div className="flex justify-between text-xs text-[--cb-text-tertiary] mb-1">
                                        <span>{t('admin.token_circulating')}</span>
                                        <span>{supplyPct.toFixed(2)}%</span>
                                    </div>
                                    <div className="h-2 rounded-full bg-[--cb-bg-surface] overflow-hidden">
                                        <div className="h-full rounded-full bg-[--cb-brand] transition-all"
                                             style={{ width: `${Math.min(supplyPct, 100)}%` }} />
                                    </div>
                                </div>

                                <div className="border-t border-[--cb-border-subtle] pt-3 text-sm text-[--cb-text-secondary]">
                                    <span className="text-[--cb-text-tertiary] text-xs">{t('admin.token_issuer')}: </span>
                                    <span className="font-mono">{stat.issuer}</span>
                                </div>
                            </div>

                            <button className="cb-btn cb-btn-ghost cb-btn-sm text-xs" onClick={loadStat}>
                                ↺ {t('common.refresh')}
                            </button>
                        </>
                    ) : (
                        <p className="text-[--cb-text-tertiary] text-sm">{t('admin.token_no_stat')}</p>
                    )}
                </div>
            )}

            {/* ══════════ SALDOS ══════════ */}
            {!loading && tab === 'balances' && (
                <div className="space-y-4" style={{ maxWidth: '38rem' }}>
                    <div className="grid gap-3">
                        {/* Admin wallet */}
                        <div className="cb-card p-4 flex items-center justify-between gap-4" data-testid={`token-row-${actor || 'admin'}`}>
                            <div>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('admin.token_admin_wallet')}</p>
                                <p className="text-sm text-[--cb-text-tertiary] font-mono mt-0.5">{actor || '—'}</p>
                            </div>
                            <p className="text-lg font-mono font-bold text-[--cb-text-primary] shrink-0">
                                {adminWalletBal !== null ? adminWalletBal.toFixed(TOKEN_PRECISION) : '—'} <span className="text-xs text-[--cb-text-tertiary]">{TOKEN_SYMBOL}</span>
                            </p>
                        </div>

                        {/* bingogamectr — conta no token externo */}
                        <div className="cb-card p-4 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('admin.token_contract_wallet')}</p>
                                <p className="text-sm text-[--cb-text-tertiary] font-mono mt-0.5">{GAME_CONTRACT} @ {TOKEN_CONTRACT}</p>
                            </div>
                            <p className="text-lg font-mono font-bold text-[--cb-text-primary] shrink-0">
                                {contractWalletBal !== null ? contractWalletBal.toFixed(TOKEN_PRECISION) : '—'} <span className="text-xs text-[--cb-text-tertiary]">{TOKEN_SYMBOL}</span>
                            </p>
                        </div>

                        {/* Saldo interno agregado dos jogadores */}
                        <div className="cb-card p-4 flex items-center justify-between gap-4">
                            <div>
                                <p className="text-xs text-[--cb-text-tertiary]">{t('admin.token_internal_total')}</p>
                                <p className="text-sm text-[--cb-text-tertiary] font-mono mt-0.5">{GAME_CONTRACT} · balances table</p>
                            </div>
                            <p className="text-lg font-mono font-bold text-[--cb-brand] shrink-0">
                                {contractGameBal !== null ? contractGameBal.toFixed(TOKEN_PRECISION) : '—'} <span className="text-xs text-[--cb-text-tertiary]">{TOKEN_SYMBOL}</span>
                            </p>
                        </div>

                        {/* Delta: tokens livres no contrato (não alocados a jogadores) */}
                        {contractWalletBal !== null && contractGameBal !== null && (
                            <div className="cb-card p-4 flex items-center justify-between gap-4"
                                 style={{ borderColor: contractWalletBal - contractGameBal < 0 ? 'var(--cb-danger)' : 'var(--cb-border-subtle)' }}>
                                <div>
                                    <p className="text-xs text-[--cb-text-tertiary]">{t('admin.token_free_float')}</p>
                                    <p className="text-xs text-[--cb-text-tertiary] mt-0.5">{t('admin.token_free_float_desc')}</p>
                                </div>
                                <p className={`text-lg font-mono font-bold shrink-0 ${contractWalletBal - contractGameBal < 0 ? 'text-[--cb-danger]' : 'text-[--cb-success]'}`}>
                                    {(contractWalletBal - contractGameBal).toFixed(TOKEN_PRECISION)} <span className="text-xs text-[--cb-text-tertiary]">{TOKEN_SYMBOL}</span>
                                </p>
                            </div>
                        )}
                    </div>

                    <button className="cb-btn cb-btn-ghost cb-btn-sm text-xs" onClick={loadBalances}>
                        ↺ {t('common.refresh')}
                    </button>
                </div>
            )}

            {/* ══════════ OPERAÇÕES ══════════ */}
            {!loading && tab === 'ops' && (
                <div style={{ maxWidth: '34rem' }}>
                    {/* Seletor de operação */}
                    <div className="flex gap-2 mb-5">
                        {(['issue', 'retire', 'transfer'] as OpMode[]).map(op => (
                            <button key={op}
                                className={`cb-btn cb-btn-sm flex-1 ${opMode === op ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                                onClick={() => { setOpMode(op); setError(null); setSuccess(null); setQtyErr(null); }}>
                                {t(`admin.token_op_${op}`)}
                            </button>
                        ))}
                    </div>

                    <div className="cb-card p-5 space-y-4">
                        {/* Descrição da operação */}
                        <p className="text-sm text-[--cb-text-tertiary]">{t(`admin.token_op_${opMode}_desc`)}</p>

                        {/* Destinatário — só transfer */}
                        {opMode === 'transfer' && (
                            <label className="flex flex-col gap-1">
                                <span className="text-xs text-[--cb-text-tertiary]">{t('admin.token_recipient')}</span>
                                <input className="cb-input font-mono" placeholder="eosaccount11"
                                    value={toAddr}
                                    onChange={e => setToAddr(e.target.value)} />
                            </label>
                        )}

                        {/* Quantidade */}
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">{t('admin.token_amount')} ({TOKEN_SYMBOL})</span>
                            <input className={`cb-input font-mono ${qtyErr ? 'border-[--cb-danger]' : ''}`}
                                type="number" step={`0.${'0'.repeat(TOKEN_PRECISION - 1)}1`} min="0"
                                placeholder={`0.${'0'.repeat(TOKEN_PRECISION)}`}
                                value={qty}
                                onChange={e => { setQty(e.target.value); setQtyErr(null); }} />
                            {qtyErr && <span className="text-xs text-[--cb-danger]">{qtyErr}</span>}
                        </label>

                        {/* Memo */}
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">{t('admin.token_memo')}</span>
                            <input className="cb-input" placeholder={t('admin.token_memo_placeholder')}
                                value={memo}
                                onChange={e => setMemo(e.target.value)} />
                        </label>

                        {/* Aviso retire */}
                        {opMode === 'retire' && (
                            <div className="cb-alert cb-alert-warning text-xs">
                                ⚠️ {t('admin.token_retire_warning')}
                            </div>
                        )}

                        <button
                            className={`cb-btn w-full ${opMode === 'retire' ? 'cb-btn-danger' : 'cb-btn-primary'}`}
                            onClick={execOp}
                            disabled={!session || !qty}>
                            {t(`admin.token_op_${opMode}`)}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
