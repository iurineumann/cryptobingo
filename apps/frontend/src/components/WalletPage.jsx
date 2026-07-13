import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchSupportedTokens } from '../services/api';
import Seo from './Seo';
const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';
export default function WalletPage({ session }) {
    const { t } = useTranslation();
    const [tokens, setTokens] = useState([]);
    const [walletBalances, setWalletBals] = useState([]);
    const [contractBalances, setContractBals] = useState([]);
    const [loading, setLoading] = useState(true);
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('deposit');
    const [sending, setSending] = useState(false);
    const [txResult, setTxResult] = useState(null);
    // Token selecionado para depósito/saque (padrão: primeiro token não-nativo)
    const [selectedSymbol, setSelectedSymbol] = useState('');
    const loadBalances = useCallback(async () => {
        setLoading(true);
        try {
            const { tokens: cfg } = await fetchSupportedTokens();
            setTokens(cfg);
            const actor = String(session.actor);
            // ── Saldos on-contract (multi-symbol) ────────────────────────
            const contractRes = await session.client.v1.chain.get_table_rows({
                code: CONTRACT_ACCOUNT, scope: actor,
                table: 'balances', limit: 50, json: true,
            });
            const contractBals = contractRes.rows.map(r => {
                const qty = r.balance?.quantity ?? '0';
                const sym = qty.split(' ')[1] ?? '';
                const cfgT = cfg.find(c => c.symbol === sym);
                return {
                    label: cfgT?.label ?? sym,
                    symbol: sym,
                    amount: parseFloat(qty) || 0,
                    precision: cfgT?.precision ?? 4,
                    is_native: false,
                    location: 'contract',
                };
            });
            setContractBals(contractBals);
            // ── Saldos off-contract por token cadastrado ──────────────────
            const walletBals = [];
            for (const tok of cfg) {
                if (tok.is_native) {
                    // WAX nativo via get_account
                    try {
                        const acc = await session.client.v1.chain.get_account(actor);
                        const liquid = parseFloat(String(acc?.core_liquid_balance ?? '0')) || 0;
                        walletBals.push({ label: tok.label, symbol: tok.symbol, amount: liquid, precision: tok.precision, is_native: true, location: 'wallet' });
                    }
                    catch {
                        walletBals.push({ label: tok.label, symbol: tok.symbol, amount: 0, precision: tok.precision, is_native: true, location: 'wallet' });
                    }
                }
                else {
                    // Token EOSIO: accounts table com scope = actor (string name, não UInt64)
                    try {
                        const res = await session.client.v1.chain.get_table_rows({
                            code: tok.contract, scope: actor,
                            table: 'accounts', limit: 10, json: true,
                        });
                        const row = res.rows.find(r => String(r.balance ?? '').endsWith(tok.symbol));
                        const amount = row ? parseFloat(String(row.balance)) || 0 : 0;
                        walletBals.push({ label: tok.label, symbol: tok.symbol, amount, precision: tok.precision, is_native: false, location: 'wallet' });
                    }
                    catch {
                        walletBals.push({ label: tok.label, symbol: tok.symbol, amount: 0, precision: tok.precision, is_native: false, location: 'wallet' });
                    }
                }
            }
            setWalletBals(walletBals);
            // Selecionar primeiro token não-nativo por padrão; fallback nativo
            const firstNonNative = cfg.find(t => !t.is_native);
            setSelectedSymbol(firstNonNative?.symbol ?? cfg[0]?.symbol ?? '');
        }
        catch (err) {
            console.error('[WalletPage] Erro ao carregar saldos:', err);
        }
        finally {
            setLoading(false);
        }
    }, [session]);
    useEffect(() => { loadBalances(); }, [loadBalances]);
    const selectedToken = tokens.find(tk => tk.symbol === selectedSymbol);
    const walletAmount = walletBalances.find(b => b.symbol === selectedSymbol)?.amount ?? 0;
    const contractAmount = contractBalances.find(b => b.symbol === selectedSymbol)?.amount ?? 0;
    const maxAmount = mode === 'deposit' ? walletAmount : contractAmount;
    const handleAction = async () => {
        if (!selectedToken)
            return;
        const qty = parseFloat(amount);
        if (!qty || qty <= 0)
            return;
        setSending(true);
        setTxResult(null);
        try {
            const quantityStr = qty.toFixed(selectedToken.precision) + ' ' + selectedToken.symbol;
            if (mode === 'deposit') {
                if (qty > walletAmount) {
                    setTxResult({ ok: false, msg: t('wallet_page.no_balance') });
                    setSending(false);
                    return;
                }
                await session.transact({
                    actions: [{
                            account: selectedToken.contract,
                            name: 'transfer',
                            authorization: [session.permissionLevel],
                            data: { from: String(session.actor), to: CONTRACT_ACCOUNT, quantity: quantityStr, memo: 'deposit' },
                        }],
                }, { broadcast: true });
                setTxResult({ ok: true, msg: t('wallet_page.success_deposit') });
            }
            else {
                if (qty > contractAmount) {
                    setTxResult({ ok: false, msg: t('wallet_page.insufficient_contract') });
                    setSending(false);
                    return;
                }
                await session.transact({
                    actions: [{
                            account: CONTRACT_ACCOUNT,
                            name: 'withdraw',
                            authorization: [session.permissionLevel],
                            data: { owner: String(session.actor), amount: { quantity: quantityStr, contract: selectedToken.contract } },
                        }],
                }, { broadcast: true });
                setTxResult({ ok: true, msg: t('wallet_page.success_withdraw') });
            }
            setAmount('');
            await loadBalances();
        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setTxResult({ ok: false, msg: t('wallet_page.error', { msg }) });
        }
        finally {
            setSending(false);
        }
    };
    return (<div className="max-w-xl mx-auto space-y-6" data-testid="wallet-page">
            <Seo title="Carteira" description="Gerencie seus tokens WAX na CryptoBingo: depósitos, saques e saldos."/>
            <h2 className="text-xl font-bold text-[--cb-text-primary]" data-testid="wallet-title">{t('wallet_page.title')}</h2>

            {/* ── Saldos off-contract ───────────────────────────────── */}
            <div>
                <p className="text-xs font-semibold text-[--cb-text-tertiary] uppercase mb-2">
                    {t('wallet_page.wallet_balance')}
                </p>
                {loading ? (<p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>) : walletBalances.length === 0 ? (<p className="text-sm text-[--cb-text-tertiary]" data-testid="wallet-empty">{t('wallet_page.no_tokens_configured')}</p>) : (<div className="grid grid-cols-2 gap-3">
                        {walletBalances.map(b => (<div key={b.symbol} className="cb-card p-3" data-testid={`wallet-balance-${b.symbol}`}>
                                <p className="text-xs text-[--cb-text-tertiary] mb-1">{b.label}</p>
                                <p className="text-base font-mono font-bold text-[--cb-text-primary]">
                                    {b.amount.toFixed(b.precision)} {b.symbol}
                                </p>
                            </div>))}
                    </div>)}
            </div>

            {/* ── Saldos on-contract ───────────────────────────────── */}
            <div>
                <p className="text-xs font-semibold text-[--cb-text-tertiary] uppercase mb-2">
                    {t('wallet_page.on_contract')}
                </p>
                {loading ? (<p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>) : contractBalances.length === 0 ? (<p className="text-sm text-[--cb-text-tertiary]">—</p>) : (<div className="grid grid-cols-2 gap-3">
                        {contractBalances.map(b => (<div key={b.symbol} className="cb-card p-3" data-testid={`wallet-contract-${b.symbol}`}>
                                <p className="text-xs text-[--cb-text-tertiary] mb-1">{b.label}</p>
                                <p className="text-base font-mono font-bold text-[--cb-text-primary]">
                                    {b.amount.toFixed(b.precision)} {b.symbol}
                                </p>
                            </div>))}
                    </div>)}
            </div>

            <button className="cb-btn cb-btn-ghost cb-btn-sm text-xs" onClick={loadBalances} disabled={loading} data-testid="wallet-refresh">
                {t('wallet_page.refresh')}
            </button>

            {/* ── Formulário depósito/saque ─────────────────────────── */}
            {tokens.length > 0 && (<div className="cb-card p-5 space-y-4">
                    {/* Seleção de token */}
                    {tokens.length > 0 && (<div className="flex gap-2 flex-wrap">
                            {tokens.map(tk => (<button key={tk.symbol} onClick={() => { setSelectedSymbol(tk.symbol); setTxResult(null); }} className={`cb-btn cb-btn-sm ${selectedSymbol === tk.symbol ? 'cb-btn-primary' : 'cb-btn-outline'}`} data-testid={`wallet-token-${tk.symbol}`}>
                                    {tk.symbol}
                                </button>))}
                        </div>)}

                    {/* Abas depositar/sacar */}
                    <div className="flex gap-2">
                        <button className={`cb-btn cb-btn-sm flex-1 ${mode === 'deposit' ? 'cb-btn-primary' : 'cb-btn-outline'}`} onClick={() => { setMode('deposit'); setTxResult(null); }} data-testid="wallet-mode-deposit">
                            {t('wallet_page.deposit')}
                        </button>
                        <button className={`cb-btn cb-btn-sm flex-1 ${mode === 'withdraw' ? 'cb-btn-primary' : 'cb-btn-outline'}`} onClick={() => { setMode('withdraw'); setTxResult(null); }} data-testid="wallet-mode-withdraw">
                            {t('wallet_page.withdraw')}
                        </button>
                    </div>

                    <p className="text-sm text-[--cb-text-tertiary]">
                        {mode === 'deposit' ? t('wallet_page.deposit_desc') : t('wallet_page.withdraw_desc')}
                    </p>

                    <div>
                        <label className="block text-sm text-[--cb-text-secondary] mb-1">{t('wallet_page.amount')}</label>
                        <div className="flex gap-2 items-center">
                            <input type="number" step={Math.pow(10, -(selectedToken?.precision ?? 4)).toFixed(selectedToken?.precision ?? 4)} min="0" className="cb-input flex-1" placeholder={t('wallet_page.amount_placeholder')} value={amount} onChange={e => setAmount(e.target.value)} disabled={sending} data-testid="wallet-amount-input"/>
                            <button className="cb-btn cb-btn-ghost cb-btn-xs text-xs" onClick={() => setAmount(maxAmount > 0 ? maxAmount.toFixed(selectedToken?.precision ?? 4) : '0')} disabled={sending || maxAmount <= 0} data-testid="wallet-max-btn">
                                {t('wallet_page.max')}
                            </button>
                        </div>
                    </div>

                    <button className={`cb-btn w-full ${mode === 'deposit' ? 'cb-btn-primary' : 'cb-btn-danger'}`} onClick={handleAction} disabled={sending || !amount || parseFloat(amount) <= 0 || !selectedToken} data-testid="wallet-action-btn">
                        {sending ? t('wallet_page.sending') : (mode === 'deposit' ? t('wallet_page.deposit_action') : t('wallet_page.withdraw_action'))}
                    </button>

                    {txResult && (<div className={`text-sm p-3 rounded-lg ${txResult.ok ? 'bg-[color-mix(in_srgb,var(--cb-success)_10%,transparent)] text-[--cb-success]' : 'bg-[color-mix(in_srgb,var(--cb-danger)_10%,transparent)] text-[--cb-danger]'}`} data-testid="wallet-result">
                            {txResult.msg}
                        </div>)}
                </div>)}
        </div>);
}
//# sourceMappingURL=WalletPage.js.map