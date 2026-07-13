import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Check } from 'lucide-react';
import { getAuthToken, updateUserPermissions } from '../../services/api';
import { hasAnyPermission } from '../../utils/permissionMatcher';
import { API_BASE } from '@/config/env';
const AVAILABLE_PERMS = [
    { id: 'admin.*', label: 'Super Admin (todas)' },
    { id: 'admin.dashboard.view', label: 'Dashboard' },
    { id: 'admin.rooms.manage', label: 'Salas' },
    { id: 'admin.patterns.manage', label: 'Padrões' },
    { id: 'admin.gametypes.manage', label: 'Game Types' },
    { id: 'admin.users.view', label: 'Usuários (ver)' },
    { id: 'admin.users.manage', label: 'Usuários (gerir)' },
    { id: 'admin.sponsors.view', label: 'Sponsors (ver)' },
    { id: 'admin.sponsors.manage', label: 'Sponsors (gerir)' },
    { id: 'admin.tokens.manage', label: 'Tokens' },
    { id: 'admin.nfts.manage', label: 'NFTs' },
    { id: 'admin.campaigns.manage', label: 'Campanhas' },
    { id: 'admin.vault.manage', label: 'Vault' },
    { id: 'admin.compliance.view', label: 'Compliance' },
    { id: 'admin.news.manage', label: 'Notícias' },
    { id: 'admin.config.manage', label: 'Config' },
];
function roleBadgeClass(role) {
    if (role === 'admin')
        return 'cb-badge-danger';
    if (role === 'operator')
        return 'cb-status-funding';
    return 'cb-badge-neutral';
}
function PermEditModal({ wallet, currentPerms, onClose, onSaved, }) {
    const { t } = useTranslation();
    const [selected, setSelected] = useState(new Set(currentPerms));
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState(null);
    const toggle = (permId) => {
        const next = new Set(selected);
        if (permId === 'admin.*') {
            if (next.has('admin.*'))
                next.delete('admin.*');
            else
                next.add('admin.*');
        }
        else {
            if (next.has('admin.*'))
                next.delete('admin.*');
            if (next.has(permId))
                next.delete(permId);
            else
                next.add(permId);
        }
        setSelected(next);
    };
    const save = async () => {
        setSaving(true);
        setError(null);
        try {
            const perms = selected.has('admin.*') ? ['admin.*'] : Array.from(selected);
            await updateUserPermissions(wallet, perms);
            onSaved();
        }
        catch (err) {
            console.error('[UsersAdmin]', err);
            setError(t('errors.generic'));
        }
        finally {
            setSaving(false);
        }
    };
    return (<div className="fixed inset-0 z-50 flex items-center justify-center">
            <button className="absolute inset-0 bg-black/50 border-0 cursor-default" aria-label="Fechar" onClick={onClose}/>
            <div className="cb-card p-6 max-w-md w-full mx-4 relative z-10">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-semibold">{t('admin.edit_permissions')} — {wallet}</h3>
                    <button onClick={onClose} className="cb-btn cb-btn-ghost cb-btn-sm"><X className="size-4"/></button>
                </div>

                {error && (<div className="cb-alert cb-alert-error mb-4">
                        <span><TriangleAlert className="size-4 shrink-0"/> {error}</span>
                    </div>)}

                <div className="space-y-2 max-h-60 overflow-y-auto">
                    {AVAILABLE_PERMS.map(p => (<label key={p.id} className="flex items-center gap-2 cursor-pointer text-sm">
                            <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} className="cb-checkbox"/>
                            {p.label}
                        </label>))}
                </div>

                <div className="flex justify-end gap-2 mt-6">
                    <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onClose}>{t('common.cancel')}</button>
                    <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={save} disabled={saving}>
                        {saving ? t('common.saving') : <><Check className="size-4"/> {t('common.save')}</>}
                    </button>
                </div>
            </div>
        </div>);
}
export default function UsersAdmin({ permissions }) {
    const { t } = useTranslation();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [editWallet, setEditWallet] = useState(null);
    const [editPerms, setEditPerms] = useState([]);
    const canManage = hasAnyPermission(permissions, ['admin.*', 'admin.users.manage']);
    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/admin/users`, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`,
                },
            });
            if (!res.ok)
                throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setUsers(data.users ?? []);
        }
        catch (err) {
            setError(err instanceof Error ? err.message : t('admin.users_error_load'));
        }
        finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); }, []);
    return (<div>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.users_desc')}</p>

            {error && (<div className="cb-alert cb-alert-error mb-4">
                    <span><TriangleAlert className="size-4 shrink-0"/> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0"/></button>
                </div>)}

            {loading ? (<div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4"/><span>{t('admin.users_loading')}</span></div>) : (<div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_wallet')}</th>
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_name')}</th>
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_role')}</th>
                                <th className="text-left py-2 pr-4 font-medium">Permissões</th>
                                <th className="text-right py-2 font-medium">Ações</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (<tr key={u.wallet_address} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                    <td className="py-2 pr-4 font-mono text-xs">{u.wallet_address}</td>
                                    <td className="py-2 pr-4">{u.username || '—'}</td>
                                    <td className="py-2 pr-4">
                                        {u.role ? (<span className={`cb-badge text-xs ${roleBadgeClass(u.role)}`}>{u.role}</span>) : (<span className="text-[--cb-text-tertiary]">—</span>)}
                                    </td>
                                    <td className="py-2 pr-4">
                                        {(u.permissions ?? []).length > 0 ? (<div className="flex flex-wrap gap-1">
                                                {(u.permissions ?? []).map(p => (<span key={p} className="cb-badge cb-badge-info text-xs">{p}</span>))}
                                            </div>) : (<span className="text-[--cb-text-tertiary]">—</span>)}
                                    </td>
                                    <td className="py-2 text-right">
                                        {canManage && (<button data-testid={`edit-perms-${u.wallet_address}`} className="cb-btn cb-btn-outline cb-btn-xs" onClick={() => {
                        setEditWallet(u.wallet_address);
                        setEditPerms(u.permissions ?? []);
                    }}>
                                                {t('admin.edit_permissions')}
                                            </button>)}
                                    </td>
                                </tr>))}
                            {users.length === 0 && (<tr><td colSpan={5} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.users_empty')}</td></tr>)}
                        </tbody>
                    </table>
                </div>)}

            {editWallet && (<PermEditModal wallet={editWallet} currentPerms={editPerms} onClose={() => setEditWallet(null)} onSaved={() => {
                setEditWallet(null);
                load();
            }}/>)}
        </div>);
}
//# sourceMappingURL=UsersAdmin.js.map