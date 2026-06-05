import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getAuthToken } from '../../services/api';

interface UserRow {
    wallet_address: string;
    username?: string;
    role: string;
    total_games?: number;
    total_wagered?: string;
    created_at?: string;
}

export default function UsersAdmin() {
    const { t } = useTranslation();
    const [users, setUsers] = useState<UserRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const load = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/v1/admin/users', {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${getAuthToken()}`,
                },
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            setUsers(data.users ?? []);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.users_error_load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    return (
        <div>
            <h2 className="text-xl font-bold text-[--cb-text-primary] mb-1">{t('admin.users_title')}</h2>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.users_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4"><span className="cb-spinner w-4 h-4" /><span>{t('admin.users_loading')}</span></div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-[--cb-text-tertiary] border-b border-[--cb-border-default]">
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_wallet')}</th>
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_name')}</th>
                                <th className="text-left py-2 pr-4 font-medium">{t('admin.users_col_role')}</th>
                                <th className="text-right py-2 pr-4 font-medium">{t('admin.users_col_games')}</th>
                                <th className="text-right py-2 font-medium">{t('admin.users_col_wagered')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {users.map(u => (
                                <tr key={u.wallet_address} className="border-b border-[--cb-border-default] text-[--cb-text-primary]">
                                    <td className="py-2 pr-4 font-mono text-xs">{u.wallet_address}</td>
                                    <td className="py-2 pr-4">{u.username ?? '--'}</td>
                                    <td className="py-2 pr-4">
                                        <span className={`cb-badge text-xs ${
                                            u.role === 'admin' ? 'cb-badge-danger' :
                                            u.role === 'operator' ? 'cb-status-funding' :
                                            'cb-badge-neutral'
                                        }`}>{u.role}</span>
                                    </td>
                                    <td className="py-2 pr-4 text-right">{u.total_games ?? '--'}</td>
                                    <td className="py-2 text-right font-mono">{u.total_wagered ?? '--'}</td>
                                </tr>
                            ))}
                            {users.length === 0 && (
                                <tr><td colSpan={5} className="py-4 text-center text-[--cb-text-tertiary]">{t('admin.users_empty')}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
