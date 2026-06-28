import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import { getAuthToken, createDelegation, removeDelegation } from '../../services/api';

interface SponsorsAdminProps {
    readonly permissions: string[];
}

interface Delegation {
    wallet_address: string;
    permissions: string[];
    active: boolean;
}

interface OrgRow {
    orgId: string;
    owner_wallet: string;
    name: string;
    delegations: Delegation[];
    _expanded?: boolean;
}

const DELEGATION_PERMS = [
    { id: 'sponsor.{orgId}.rooms.view', label: 'Salas (ver)' },
    { id: 'sponsor.{orgId}.rooms.manage', label: 'Salas (gerir)' },
    { id: 'sponsor.{orgId}.vault.view', label: 'Vault (ver)' },
    { id: 'sponsor.{orgId}.vault.manage', label: 'Vault (gerir)' },
    { id: 'sponsor.{orgId}.treasury.view', label: 'Tesouraria (ver)' },
    { id: 'sponsor.{orgId}.treasury.manage', label: 'Tesouraria (gerir)' },
    { id: 'sponsor.{orgId}.campaigns.view', label: 'Campanhas (ver)' },
    { id: 'sponsor.{orgId}.campaigns.manage', label: 'Campanhas (gerir)' },
];

function CreateDelegationModal({
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
            const perms = Array.from(selected).map(p => p.replace('{orgId}', orgId));
            await createDelegation(orgId, wallet.trim(), perms);
            onCreated();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <button className="absolute inset-0 bg-black/50 border-0 cursor-default" aria-label="Fechar" onClick={onClose} />
            <div className="cb-card p-6 max-w-md w-full mx-4 relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{t('admin.new_delegation')} — {orgId}</h3>
                    <button onClick={onClose} className="cb-btn cb-btn-ghost cb-btn-sm"><X className="size-4" /></button>
                </div>

                {error && (
                    <div className="cb-alert cb-alert-error mb-4">
                        <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    </div>
                )}

                <div className="mb-4">
                    <label className="text-sm font-medium block mb-1">{t('admin.delegation_wallet')}</label>
                    <input
                        type="text"
                        value={wallet}
                        onChange={e => setWallet(e.target.value)}
                        className="cb-input w-full"
                        placeholder="wallet_address"
                    />
                </div>

                <div className="space-y-2 max-h-48 overflow-y-auto">
                    {DELEGATION_PERMS.map(p => (
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

export default function SponsorsAdmin({ permissions }: SponsorsAdminProps) {
    const { t } = useTranslation();
    const [orgs, setOrgs] = useState<OrgRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [createOrgId, setCreateOrgId] = useState<string | null>(null);

    const canManage = permissions.includes('admin.sponsors.manage');

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/sponsor-orgs', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setOrgs(data.orgs?.map((o: any) => ({ ...o, _expanded: false })) ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('common.error'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const toggleExpand = (org: OrgRow) => {
        setOrgs(prev => prev.map(o => o.orgId === org.orgId ? { ...o, _expanded: !o._expanded } : o));
    };

    const handleRemove = async (orgId: string, wallet: string) => {
        try {
            await removeDelegation(orgId, wallet);
            load();
        } catch {
            setError(t('admin.error'));
        }
    };

    return (
        <div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.sponsors_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('common.loading')}</span></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                <th className="text-left py-2 pr-4 font-medium">Org ID</th>
                                <th className="text-left py-2 pr-4 font-medium">Owner</th>
                                <th className="text-left py-2 pr-4 font-medium">Nome</th>
                                <th className="text-center py-2 pr-4 font-medium">Delegações</th>
                                <th className="text-right py-2 font-medium">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {orgs.map(org => (
                                <>
                                    <tr key={org.orgId} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                        <td className="py-2 pr-4">
                                            <button
                                                className="flex items-center gap-1 text-xs font-mono"
                                                onClick={() => toggleExpand(org)}
                                            >
                                                {org._expanded ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                                                {org.orgId}
                                            </button>
                                        </td>
                                        <td className="py-2 pr-4 font-mono text-xs">{org.owner_wallet}</td>
                                        <td className="py-2 pr-4">{org.name}</td>
                                        <td className="py-2 pr-4 text-center">{org.delegations?.length ?? 0}</td>
                                        <td className="py-2 text-right">
                                            {canManage && (
                                                <button
                                                    className="cb-btn cb-btn-outline cb-btn-xs"
                                                    onClick={() => setCreateOrgId(org.orgId)}
                                                >
                                                    <Plus className="size-3" /> {t('admin.new_delegation')}
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                    {org._expanded && (
                                        <tr key={`${org.orgId}-delegations`}>
                                            <td colSpan={5} className="py-2 pl-8">
                                                {(!org.delegations || org.delegations.length === 0) ? (
                                                    <span className="text-xs text-[--cb-text-tertiary]">{t('admin.no_delegations')}</span>
                                                ) : (
                                                    <table className="w-full text-xs">
                                                        <thead>
                                                            <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-subtle]">
                                                                <th className="text-left py-1 pr-4 font-medium">Wallet</th>
                                                                <th className="text-left py-1 pr-4 font-medium">Permissões</th>
                                                                <th className="text-right py-1 font-medium">{t('admin.actions')}</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {org.delegations.filter(d => d.active).map(d => (
                                                                <tr key={d.wallet_address} className="border-b border-[--cb-border-subtle]">
                                                                    <td className="py-1 pr-4 font-mono">{d.wallet_address}</td>
                                                                    <td className="py-1 pr-4">
                                                                        <div className="flex flex-wrap gap-1">
                                                                            {(d.permissions ?? []).map(p => (
                                                                                <span key={p} className="cb-badge cb-badge-info text-xs">{p}</span>
                                                                            ))}
                                                                        </div>
                                                                    </td>
                                                                    <td className="py-1 text-right">
                                                                        {canManage && (
                                                                            <button
                                                                                className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]"
                                                                                onClick={() => handleRemove(org.orgId, d.wallet_address)}
                                                                            >
                                                                                <Trash2 className="size-3" />
                                                                            </button>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            ))}
                                                        </tbody>
                                                    </table>
                                                )}
                                            </td>
                                        </tr>
                                    )}
                                </>
                            ))}
                            {orgs.length === 0 && (
                                <tr><td colSpan={5} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.sponsors_empty')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {createOrgId && (
                <CreateDelegationModal
                    orgId={createOrgId}
                    onClose={() => setCreateOrgId(null)}
                    onCreated={() => {
                        setCreateOrgId(null);
                        load();
                    }}
                />
            )}
        </div>
    );
}
