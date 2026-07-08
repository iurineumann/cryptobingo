import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Plus, Trash2, UserPlus } from 'lucide-react';
import { getAuthToken } from '../../services/api';
import { API_BASE } from '@/config/env';

interface SponsorDelegationsProps {
    readonly permissions?: string[];
}

interface DelegationRow {
    wallet_address: string;
    permissions: string[];
    active: boolean;
    createdAt?: string;
}

interface DelegationsResponse {
    orgId: string;
    delegations: DelegationRow[];
}

const DELEGABLE_SPONSOR_PERMS = (orgId: string) => [
    { id: `sponsor.${orgId}.dashboard.view`,    label: 'Dashboard' },
    { id: `sponsor.${orgId}.rooms.manage`,       label: 'Gerenciar Salas' },
    { id: `sponsor.${orgId}.treasury.view`,      label: 'Ver Tesouraria' },
    { id: `sponsor.${orgId}.treasury.withdraw`,  label: 'Sacar Tesouraria' },
    { id: `sponsor.${orgId}.drops.manage`,       label: 'Gerenciar Drops' },
    { id: `sponsor.${orgId}.campaigns.manage`,   label: 'Campanhas' },
    { id: `sponsor.${orgId}.nfts.manage`,        label: 'NFTs' },
    { id: `sponsor.${orgId}.layouts.manage`,     label: 'Layouts' },
];

function CreateDelegateModal({
    orgId,
    onClose,
    onCreated,
}: Readonly<{
    orgId: string;
    onClose: () => void;
    onCreated: () => void;
}>) {
    const { t } = useTranslation();
    const [wallet, setWallet] = useState('');
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const toggle = (permId: string) => {
        const next = new Set(selected);
        if (next.has(permId)) next.delete(permId);
        else next.add(permId);
        setSelected(next);
    };

    const save = async () => {
        if (!wallet.trim()) return;
        setSaving(true);
        setError(null);
        try {
            const perms = Array.from(selected);
            const res = await fetch(`${API_BASE}/sponsor/delegations`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`,
                },
                body: JSON.stringify({ wallet_address: wallet.trim(), permissions: perms }),
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center" data-testid="modal-delegacao">
            <button className="absolute inset-0 bg-black/50 border-0 cursor-default" aria-label="Fechar" onClick={onClose} />
            <div className="cb-card p-6 max-w-md w-full mx-4 relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{t('sponsor.delegation_new_title')}</h3>
                    <button onClick={onClose} className="cb-btn cb-btn-ghost cb-btn-sm"><X className="size-4" /></button>
                </div>

                {error && (
                    <div className="cb-alert cb-alert-error mb-4">
                        <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    </div>
                )}

                <div className="mb-4">
                    <label className="text-sm font-medium block mb-1">{t('sponsor.delegation_wallet')}</label>
                    <input
                        type="text"
                        value={wallet}
                        onChange={e => setWallet(e.target.value)}
                        className="cb-input w-full"
                        placeholder="wallet_address"
                    />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {DELEGABLE_SPONSOR_PERMS(orgId).map(p => (
                        <label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input
                                type="checkbox"
                                checked={selected.has(p.id)}
                                onChange={() => toggle(p.id)}
                                className="cb-checkbox"
                            />
                            {p.label}
                        </label>
                    ))}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onClose}>{t('common.cancel')}</button>
                    <button
                        className="cb-btn cb-btn-primary cb-btn-sm"
                        onClick={save}
                        disabled={saving || !wallet.trim()}
                    >
                        {saving ? t('common.saving') : <><Plus className="size-4" /> {t('common.create')}</>}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function SponsorDelegations({ permissions = [] }: SponsorDelegationsProps) {
    const { t } = useTranslation();
    const [data, setData] = useState<DelegationsResponse | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    const canManage = permissions.some(p => p.endsWith('.*') || p.includes('.delegations.manage'));

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/sponsor/delegations`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            setData(json);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const handleRemove = async (wallet: string) => {
        try {
            const res = await fetch(`${API_BASE}/sponsor/delegations/${wallet}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${getAuthToken()}` },
            });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            load();
        } catch {
            setError(t('common.error'));
        }
    };

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('sponsor.delegations_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" /><span>{t('common.loading')}</span>
                </div>
            ) : (
                <>
                    <div className="mb-4 text-sm text-[--cb-text-secondary]">
                        <strong>Org:</strong> {data?.orgId ?? '---'}
                    </div>

                    {canManage && (
                        <button
                            data-testid="btn-nova-delegacao"
                            className="cb-btn cb-btn-primary cb-btn-sm mb-4"
                            onClick={() => setShowCreate(true)}
                        >
                            <UserPlus className="size-4" /> {t('sponsor.delegation_new')}
                        </button>
                    )}

                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                    <th className="text-left py-2 pr-4 font-medium">{t('sponsor.delegation_col_wallet')}</th>
                                    <th className="text-left py-2 pr-4 font-medium">{t('sponsor.delegation_col_perms')}</th>
                                    <th className="text-left py-2 pr-4 font-medium">{t('sponsor.delegation_col_created')}</th>
                                    <th className="text-right py-2 font-medium">{t('sponsor.delegation_col_actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(data?.delegations ?? []).filter(d => d.active).map(d => (
                                    <tr key={d.wallet_address} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                        <td className="py-2 pr-4 font-mono text-xs">{d.wallet_address}</td>
                                        <td className="py-2 pr-4">
                                            <div className="flex flex-wrap gap-1">
                                                {d.permissions.map(p => (
                                                    <span key={p} className="cb-badge cb-badge-info text-xs">{p}</span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="py-2 pr-4 text-xs text-[--cb-text-tertiary]">
                                            {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : '---'}
                                        </td>
                                        <td className="py-2 text-right">
                                            {canManage && (
                                                <button
                                                    className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]"
                                                    onClick={() => handleRemove(d.wallet_address)}
                                                >
                                                    <Trash2 className="size-3" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {(data?.delegations ?? []).length === 0 && (
                                    <tr><td colSpan={4} className="py-4 text-center text-[--cb-text-tertiary]">{t('sponsor.delegations_empty')}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}

            {showCreate && data && (
                <CreateDelegateModal
                    orgId={data.orgId}
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        setShowCreate(false);
                        load();
                    }}
                />
            )}
        </div>
    );
}
