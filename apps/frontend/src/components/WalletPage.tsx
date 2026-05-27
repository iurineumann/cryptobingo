import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Name, Session } from '@wharfkit/session';
import type { BlockchainBalance } from '@cryptobingo/shared-types';

interface WalletPageProps { session: Session }

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
const BINGO_TOKEN_CONTRACT = 'bingo.token';

export default function WalletPage({ session }: WalletPageProps) {
    const { t } = useTranslation();

    const [gameBalances, setGameBalances] = useState<BlockchainBalance[]>([]);
    const [walletBalances, setWalletBalances] = useState<BlockchainBalance[]>([]);
    const [loadingBalances, setLoadingBalances] = useState(true);

    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState<'deposit' | 'withdraw'>('deposit');
    const [sending, setSending] = useState(false);
    const [txResult, setTxResult] = useState<{ ok: boolean; msg: string } | null>(null);

    const getGameBalance = (): number => {
        if (!gameBalances.length) return 0;
        return parseFloat(gameBalances[0].balance.quantity) || 0;
    };

    const getWalletBalance = (): number => {
        if (!walletBalances.length) return 0;
        return parseFloat(walletBalances[0].balance.quantity) || 0;
    };

    const loadBalances = useCallback(async () => {
        setLoadingBalances(true);
        try {
            const ownerScope = Name.from(session.actor).value.toString();
            const [gameRes, tokenRes] = await Promise.all([
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT, scope: ownerScope,
                    table: 'balances', limit: 20, json: true,
                }),
                session.client.v1.chain.get_table_rows({
                    code: BINGO_TOKEN_CONTRACT, scope: ownerScope,
                    table: 'accounts', limit: 20, json: true,
                }),
            ]);
            setGameBalances(gameRes.rows as BlockchainBalance[]);
            const walletBal: BlockchainBalance[] = (tokenRes.rows as Array<{ balance: string }>)
                .filter(r => r.balance.endsWith('BINGO'))
                .map(r => ({
                    balance: { quantity: r.balance, contract: BINGO_TOKEN_CONTRACT },
                }));
            setWalletBalances(walletBal);
        } catch (err) {
            console.error('[WalletPage] Erro ao carregar saldos:', err);
        } finally {
            setLoadingBalances(false);
        }
    }, [session]);

    useEffect(() => { loadBalances(); }, [loadBalances]);

    const handleAction = async () => {
        const qty = parseFloat(amount);
        if (!qty || qty <= 0) return;
        setSending(true);
        setTxResult(null);

        try {
            const quantityStr = qty.toFixed(4) + ' BINGO';
            if (mode === 'deposit') {
                if (qty > getWalletBalance()) {
                    setTxResult({ ok: false, msg: t('wallet_page.no_balance') });
                    setSending(false);
                    return;
                }
                await session.transact({
                    actions: [{
                        account: BINGO_TOKEN_CONTRACT,
                        name: 'transfer',
                        authorization: [session.permissionLevel],
                        data: {
                            from: String(session.actor),
                            to: CONTRACT_ACCOUNT,
                            quantity: quantityStr,
                            memo: 'deposit',
                        },
                    }],
                }, { broadcast: true });
                setTxResult({ ok: true, msg: t('wallet_page.success_deposit') });
            } else {
                if (qty > getGameBalance()) {
                    setTxResult({ ok: false, msg: t('wallet_page.insufficient_contract') });
                    setSending(false);
                    return;
                }
                await session.transact({
                    actions: [{
                        account: CONTRACT_ACCOUNT,
                        name: 'withdraw',
                        authorization: [session.permissionLevel],
                        data: {
                            owner: String(session.actor),
                            amount: {
                                quantity: quantityStr,
                                contract: BINGO_TOKEN_CONTRACT,
                            },
                        },
                    }],
                }, { broadcast: true });
                setTxResult({ ok: true, msg: t('wallet_page.success_withdraw') });
            }
            setAmount('');
            await loadBalances();
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            setTxResult({ ok: false, msg: t('wallet_page.error', { msg }) });
        } finally {
            setSending(false);
        }
    };

    const maxAmount = mode === 'deposit' ? getWalletBalance() : getGameBalance();

    return (
        <div className="max-w-xl mx-auto space-y-6">
            <h2 className="text-xl font-bold text-[--cb-text-primary]">{t('wallet_page.title')}</h2>

            {/* Saldos */}
            <div className="grid grid-cols-2 gap-4">
                <div className="cb-card p-4">
                    <p className="text-xs text-[--cb-text-tertiary] mb-1">{t('wallet_page.contract_balance')}</p>
                    {loadingBalances ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>
                    ) : (
                        <p className="text-lg font-mono font-bold text-[--cb-text-primary]">
                            {getGameBalance().toFixed(4)} BINGO
                        </p>
                    )}
                </div>
                <div className="cb-card p-4">
                    <p className="text-xs text-[--cb-text-tertiary] mb-1">{t('wallet_page.wallet_balance')}</p>
                    {loadingBalances ? (
                        <p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>
                    ) : (
                        <p className="text-lg font-mono font-bold text-[--cb-text-primary]">
                            {getWalletBalance().toFixed(4)} BINGO
                        </p>
                    )}
                </div>
            </div>

            <button
                className="cb-btn cb-btn-ghost cb-btn-sm text-xs"
                onClick={loadBalances}
                disabled={loadingBalances}
            >
                {t('wallet_page.refresh')}
            </button>

            {/* Formulário */}
            <div className="cb-card p-5 space-y-4">
                {/* Abas: Depositar / Sacar */}
                <div className="flex gap-2">
                    <button
                        className={`cb-btn cb-btn-sm flex-1 ${mode === 'deposit' ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                        onClick={() => { setMode('deposit'); setTxResult(null); }}
                    >
                        {t('wallet_page.deposit')}
                    </button>
                    <button
                        className={`cb-btn cb-btn-sm flex-1 ${mode === 'withdraw' ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                        onClick={() => { setMode('withdraw'); setTxResult(null); }}
                    >
                        {t('wallet_page.withdraw')}
                    </button>
                </div>

                <p className="text-sm text-[--cb-text-tertiary]">
                    {mode === 'deposit' ? t('wallet_page.deposit_desc') : t('wallet_page.withdraw_desc')}
                </p>

                <div>
                    <label className="block text-sm text-[--cb-text-secondary] mb-1">
                        {t('wallet_page.amount')}
                    </label>
                    <div className="flex gap-2 items-center">
                        <input
                            type="number"
                            step="0.0001"
                            min="0"
                            className="cb-input flex-1"
                            placeholder={t('wallet_page.amount_placeholder')}
                            value={amount}
                            onChange={e => setAmount(e.target.value)}
                            disabled={sending}
                        />
                        <button
                            className="cb-btn cb-btn-ghost cb-btn-xs text-xs"
                            onClick={() => setAmount(maxAmount > 0 ? maxAmount.toFixed(4) : '0')}
                            disabled={sending || maxAmount <= 0}
                        >
                            {t('wallet_page.max')}
                        </button>
                    </div>
                </div>

                <button
                    className={`cb-btn w-full ${mode === 'deposit' ? 'cb-btn-primary' : 'cb-btn-danger'}`}
                    onClick={handleAction}
                    disabled={sending || !amount || parseFloat(amount) <= 0}
                >
                    {sending ? t('wallet_page.sending') : (mode === 'deposit' ? t('wallet_page.deposit_action') : t('wallet_page.withdraw_action'))}
                </button>

                {txResult && (
                    <div className={`text-sm p-3 rounded-lg ${txResult.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                        {txResult.msg}
                    </div>
                )}
            </div>
        </div>
    );
}
