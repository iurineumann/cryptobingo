import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchSupportedTokens, createSupportedToken, deleteSupportedToken,
    type SystemToken,
} from '../../services/api';

export default function SystemTokensAdmin() {
    const { t } = useTranslation();

    const [tokens, setTokens]   = useState<SystemToken[]>([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg]         = useState<{ ok: boolean; text: string } | null>(null);

    const [form, setForm] = useState({
        contract:  '',
        symbol:    '',
        precision: 4,
        label:     '',
        is_native: false,
    });
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            // Admin pode ver todos — usa endpoint público que retorna enabled=true
            const { tokens: all } = await fetchSupportedTokens();
            setTokens(all);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async () => {
        if (!form.contract || !form.symbol || !form.label) return;
        setSaving(true);
        setMsg(null);
        try {
            await createSupportedToken(form);
            setMsg({ ok: true, text: t('token_admin.success_create') });
            setForm({ contract: '', symbol: '', precision: 4, label: '', is_native: false });
            await load();
        } catch (e: any) {
            const isDup = String(e?.message ?? '').includes('409') || String(e?.message ?? '').includes('já cadastrado');
            setMsg({ ok: false, text: isDup ? t('token_admin.duplicate') : t('token_admin.error_create') });
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm(t('token_admin.remove_confirm'))) return;
        try {
            await deleteSupportedToken(id);
            setMsg({ ok: true, text: t('token_admin.success_delete') });
            await load();
        } catch {
            setMsg({ ok: false, text: t('token_admin.error_delete') });
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-lg font-bold text-[--cb-text-primary]">{t('token_admin.title')}</h2>

            {/* Lista */}
            {loading ? (
                <p className="text-sm text-[--cb-text-tertiary]">{t('common.loading')}</p>
            ) : tokens.length === 0 ? (
                <p className="text-sm text-[--cb-text-tertiary]">{t('token_admin.empty')}</p>
            ) : (
                <div className="space-y-2">
                    {tokens.map(tk => (
                        <div key={tk._id} className="cb-card p-3 flex items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-medium text-[--cb-text-primary]">
                                    {tk.label} <span className="font-mono text-xs text-[--cb-text-tertiary]">({tk.symbol})</span>
                                </p>
                                <p className="text-xs text-[--cb-text-tertiary] font-mono">{tk.contract}</p>
                                {tk.is_native && (
                                    <span className="text-xs bg-[--cb-brand]/10 text-[--cb-brand] px-1.5 py-0.5 rounded">native</span>
                                )}
                            </div>
                            <button
                                className="cb-btn cb-btn-danger cb-btn-xs"
                                onClick={() => handleDelete(tk._id)}
                                data-testid={`token-delete-${tk.symbol}`}
                            >
                                {t('token_admin.remove')}
                            </button>
                        </div>
                    ))}
                </div>
            )}

            {/* Formulário */}
            <div className="cb-card p-5 space-y-4">
                <h3 className="text-sm font-semibold text-[--cb-text-secondary]">{t('token_admin.add')}</h3>

                <div className="grid grid-cols-2 gap-3">
                    <div>
                        <label className="block text-xs text-[--cb-text-secondary] mb-1">{t('token_admin.contract_label')}</label>
                        <input className="cb-input w-full" placeholder="eosio.token"
                            value={form.contract} onChange={e => setForm(f => ({ ...f, contract: e.target.value }))}
                            data-testid="token-contract-input" />
                    </div>
                    <div>
                        <label className="block text-xs text-[--cb-text-secondary] mb-1">{t('token_admin.symbol_label')}</label>
                        <input className="cb-input w-full" placeholder="WAX"
                            value={form.symbol} onChange={e => setForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                            data-testid="token-symbol-input" />
                    </div>
                    <div>
                        <label className="block text-xs text-[--cb-text-secondary] mb-1">{t('token_admin.precision_label')}</label>
                        <input className="cb-input w-full" type="number" min={0} max={18}
                            value={form.precision} onChange={e => setForm(f => ({ ...f, precision: parseInt(e.target.value) || 0 }))}
                            data-testid="token-precision-input" />
                    </div>
                    <div>
                        <label className="block text-xs text-[--cb-text-secondary] mb-1">{t('token_admin.label_label')}</label>
                        <input className="cb-input w-full" placeholder="WAX"
                            value={form.label} onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
                            data-testid="token-label-input" />
                    </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-[--cb-text-secondary] cursor-pointer">
                    <input type="checkbox" checked={form.is_native}
                        onChange={e => setForm(f => ({ ...f, is_native: e.target.checked }))}
                        data-testid="token-native-checkbox" />
                    {t('token_admin.is_native_label')}
                </label>

                <button
                    className="cb-btn cb-btn-primary"
                    onClick={handleCreate}
                    disabled={saving || !form.contract || !form.symbol || !form.label}
                    data-testid="token-create-btn"
                >
                    {saving ? '...' : t('token_admin.save')}
                </button>

                {msg && (
                    <div className={`text-sm p-3 rounded-lg ${msg.ok ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-500'}`}>
                        {msg.text}
                    </div>
                )}
            </div>
        </div>
    );
}
