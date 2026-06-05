import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchVaultDeposits, fetchVaultDeposit,
    fetchVaultAllocations,
    allocateDropToRoom, deallocateFromRoom, reclaimVaultDeposit,
    type DropDeposit, type DropAllocation,
} from '../../services/api';

interface VaultAdminProps { _session?: never }

export default function VaultAdmin(_props: VaultAdminProps) {
    const { t } = useTranslation();

    const [tab, setTab] = useState<'deposits' | 'allocations'>('deposits');

    const [deposits, setDeposits] = useState<DropDeposit[]>([]);
    const [allocations, setAllocations] = useState<DropAllocation[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const [showAllocate, setShowAllocate] = useState(false);
    const [allocForm, setAllocForm] = useState({ deposit_id: '', room_id: '', quantity_per_drop: '', drop_chance_bps: 5000 });
    const [allocSubmitting, setAllocSubmitting] = useState(false);

    const [reclaiming, setReclaiming] = useState<string | null>(null);
    const [deallocating, setDeallocating] = useState<string | null>(null);

    const formError = useState<string | null>(null);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [depResp, allocResp] = await Promise.all([
                fetchVaultDeposits(),
                fetchVaultAllocations(),
            ]);
            setDeposits(depResp.deposits);
            setAllocations(allocResp.allocations);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.vault_error_load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadAll(); }, []);

    const handleAllocate = async () => {
        if (!allocForm.deposit_id || !allocForm.room_id) return;
        setAllocSubmitting(true);
        setError(null);
        setSuccess(null);
        try {
            const result = await allocateDropToRoom({
                deposit_id: allocForm.deposit_id,
                room_id: allocForm.room_id,
                quantity_per_drop: allocForm.quantity_per_drop || undefined,
                drop_chance_bps: allocForm.drop_chance_bps,
            });
            setSuccess(`${t('admin.vault_success_allocate')} TX: ${result.transaction_id.slice(0, 12)}...`);
            setShowAllocate(false);
            setAllocForm({ deposit_id: '', room_id: '', quantity_per_drop: '', drop_chance_bps: 5000 });
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.vault_error_allocate'));
        } finally {
            setAllocSubmitting(false);
        }
    };

    const handleDeallocate = async (allocId: string) => {
        if (!confirm(t('admin.vault_confirm_deallocate', { id: allocId }))) return;
        setDeallocating(allocId);
        setError(null);
        setSuccess(null);
        try {
            await deallocateFromRoom(allocId);
            setSuccess(t('admin.vault_success_deallocate'));
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.vault_error_deallocate'));
        } finally {
            setDeallocating(null);
        }
    };

    const handleReclaim = async (depositId: string) => {
        if (!confirm(t('admin.vault_confirm_reclaim', { id: depositId }))) return;
        setReclaiming(depositId);
        setError(null);
        setSuccess(null);
        try {
            await reclaimVaultDeposit(depositId);
            setSuccess(t('admin.vault_success_reclaim'));
            await loadAll();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.vault_error_reclaim'));
        } finally {
            setReclaiming(null);
        }
    };

    const statusBadge = (status: string) => {
        const cls = status === 'active' || status === 'deposited'
            ? 'cb-badge-success'
            : status === 'draining'
                ? 'cb-badge-warning'
                : 'cb-badge-neutral';
        return <span className={`cb-badge text-xs ${cls}`}>{status}</span>;
    };

    return (
        <div>
            <h2 className="text-xl font-bold text-[--cb-text-primary] mb-1">{t('admin.vault_title')}</h2>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('admin.vault_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4 flex items-center gap-2">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}
            {success && (
                <div className="cb-alert cb-alert-success mb-4 flex items-center gap-2">
                    <span>✓ {success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            <div className="flex gap-2 mb-6">
                <button
                    className={`cb-btn ${tab === 'deposits' ? 'cb-btn-primary' : 'cb-btn-outline'} cb-btn-sm`}
                    onClick={() => setTab('deposits')}
                >
                    {t('admin.vault_deposits')} ({deposits.length})
                </button>
                <button
                    className={`cb-btn ${tab === 'allocations' ? 'cb-btn-primary' : 'cb-btn-outline'} cb-btn-sm`}
                    onClick={() => setTab('allocations')}
                >
                    {t('admin.vault_allocations')} ({allocations.length})
                </button>
                <button
                    className="cb-btn cb-btn-primary cb-btn-sm ml-auto"
                    onClick={() => setShowAllocate(!showAllocate)}
                >
                    {showAllocate ? t('common.cancel') : t('admin.vault_allocate_new')}
                </button>
            </div>

            {showAllocate && (
                <div className="cb-card p-4 mb-6" style={{ maxWidth: '36rem' }}>
                    <h3 className="font-bold text-[--cb-text-primary] mb-3">{t('admin.vault_allocate_title')}</h3>
                    <div className="grid gap-3">
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_deposit_id')}
                            <input className="cb-input w-full mt-1" value={allocForm.deposit_id} onChange={e => setAllocForm(f => ({ ...f, deposit_id: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_room_id')}
                            <input className="cb-input w-full mt-1" value={allocForm.room_id} onChange={e => setAllocForm(f => ({ ...f, room_id: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_qty_per_drop')}
                            <input className="cb-input w-full mt-1" placeholder="10.0000 WAX" value={allocForm.quantity_per_drop} onChange={e => setAllocForm(f => ({ ...f, quantity_per_drop: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_chance_bps')}
                            <input className="cb-input w-full mt-1" type="number" min={1} max={10000} value={allocForm.drop_chance_bps} onChange={e => setAllocForm(f => ({ ...f, drop_chance_bps: parseInt(e.target.value, 10) || 0 }))} />
                        </label>
                        <button className="cb-btn cb-btn-primary" disabled={allocSubmitting} onClick={handleAllocate}>
                            {allocSubmitting ? t('common.saving') : t('admin.vault_allocate_confirm')}
                        </button>
                    </div>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" /><span>{t('common.loading')}</span>
                </div>
            ) : tab === 'deposits' ? (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28rem, 1fr))' }}>
                    {deposits.map(d => {
                        const remaining = parseFloat(d.quantity_remaining.quantity.split(' ')[0]) || 0;
                        return (
                            <div key={d.deposit_id} className="cb-card p-4 flex flex-col gap-2">
                                <div className="flex items-start justify-between">
                                    <div>
                                        <span className="font-bold text-[--cb-text-primary]">#{d.deposit_id}</span>
                                        {statusBadge(d.status)}
                                    </div>
                                    <span className="font-mono text-xs text-[--cb-text-tertiary]">{d.owner}</span>
                                </div>
                                <div className="grid grid-cols-2 gap-2 text-xs">
                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                        <span className="text-[--cb-text-tertiary] block">{t('admin.vault_asset_type')}</span>
                                        <span className="font-bold text-[--cb-text-primary] uppercase">{d.asset_type}</span>
                                    </div>
                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                        <span className="text-[--cb-text-tertiary] block">{t('admin.vault_remaining')}</span>
                                        <span className="font-mono text-[--cb-text-primary]">{d.quantity_remaining.quantity}</span>
                                    </div>
                                </div>
                                {d.asset_type === 'token' && (
                                    <div className="text-xs text-[--cb-text-tertiary]">
                                        {d.token_symbol} ({d.token_contract})
                                    </div>
                                )}
                                {d.asset_type === 'nft' && (
                                    <div className="text-xs text-[--cb-text-tertiary]">
                                        NFT #{d.nft_asset_id} · template #{d.nft_template_id} · {d.nft_collection}
                                    </div>
                                )}
                                <div className="mt-2">
                                    <button
                                        className="cb-btn cb-btn-outline cb-btn-sm text-xs"
                                        disabled={reclaiming === d.deposit_id}
                                        onClick={() => handleReclaim(d.deposit_id)}
                                    >
                                        {reclaiming === d.deposit_id ? t('common.syncing') : t('admin.vault_reclaim')}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {deposits.length === 0 && <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.vault_empty_deposits')}</p>}
                </div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28rem, 1fr))' }}>
                    {allocations.map(a => (
                        <div key={a.alloc_id} className="cb-card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between">
                                <div>
                                    <span className="font-bold text-[--cb-text-primary]">Alloc #{a.alloc_id}</span>
                                    {statusBadge(a.status)}
                                </div>
                                <span className="font-mono text-xs text-[--cb-text-tertiary">{a.owner}</span>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_room')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">#{a.room_id}</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_type')}</span>
                                    <span className="font-bold uppercase text-[--cb-text-primary]">{a.asset_type}</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_per_drop')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{a.quantity_per_drop.quantity}</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_chance')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{(a.drop_chance_bps / 100).toFixed(2)}%</span>
                                </div>
                            </div>
                            <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                <span>{t('admin.vault_executed')} {a.drops_executed}</span>
                                <span>Deposit #{a.deposit_id}</span>
                            </div>
                            {a.status === 'active' && (
                                <div className="mt-2">
                                    <button
                                        className="cb-btn cb-btn-danger cb-btn-sm text-xs"
                                        disabled={deallocating === a.alloc_id}
                                        onClick={() => handleDeallocate(a.alloc_id)}
                                    >
                                        {deallocating === a.alloc_id ? t('common.syncing') : t('admin.vault_deallocate')}
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                    {allocations.length === 0 && <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.vault_empty_allocations')}</p>}
                </div>
            )}
        </div>
    );
}
