// apps/frontend/src/components/sponsor/SponsorVault.tsx
// Painel de vault do sponsor — depósitos e alocações de drop.
// Modelo: VaultAdmin.tsx, mas com dropdown de "Minhas Salas" no form de alocação.

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    fetchVaultDeposits, fetchVaultAllocations,
    allocateDropToRoom, deallocateFromRoom, reclaimVaultDeposit,
    fetchRooms,
    type DropDeposit, type DropAllocation, type EnrichedRoom,
} from '../../services/api';

export default function SponsorVault() {
    const { t } = useTranslation();

    const [tab,           setTab]           = useState<'deposits' | 'allocations'>('deposits');
    const [deposits,      setDeposits]      = useState<DropDeposit[]>([]);
    const [allocations,   setAllocations]   = useState<DropAllocation[]>([]);
    const [rooms,         setRooms]         = useState<EnrichedRoom[]>([]);
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState<string | null>(null);
    const [success,       setSuccess]       = useState<string | null>(null);
    const [showAllocate,  setShowAllocate]  = useState(false);
    const [allocForm,     setAllocForm]     = useState({ deposit_id: '', room_id: '', quantity_per_drop: '', drop_chance_bps: 5000 });
    const [allocSubmitting, setAllocSubmitting] = useState(false);
    const [reclaiming,    setReclaiming]    = useState<string | null>(null);
    const [deallocating,  setDeallocating]  = useState<string | null>(null);

    const loadAll = async () => {
        setLoading(true);
        setError(null);
        try {
            const [depResp, allocResp, roomsResp] = await Promise.all([
                fetchVaultDeposits(),
                fetchVaultAllocations(),
                fetchRooms(),
            ]);
            setDeposits(depResp.deposits);
            setAllocations(allocResp.allocations);
            setRooms(roomsResp.rooms);
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
                deposit_id:       allocForm.deposit_id,
                room_id:          allocForm.room_id,
                quantity_per_drop: allocForm.quantity_per_drop || undefined,
                drop_chance_bps:  allocForm.drop_chance_bps,
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
            : status === 'draining' ? 'cb-badge-warning' : 'cb-badge-neutral';
        return <span className={`cb-badge text-xs ${cls}`}>{status}</span>;
    };

    // Deriva um quantity_per_drop válido a partir do saldo restante do depósito.
    // "50.0000 BINGO" → "1.0000 BINGO"  (1 unidade da mesma precision + símbolo)
    const defaultQtyPerDrop = (quantityStr: string): string => {
        const parts = quantityStr.split(' ');
        if (parts.length !== 2) return '';
        const decimals = (parts[0].split('.')[1] ?? '').length;
        return `${(1).toFixed(decimals)} ${parts[1]}`;
    };

    // Dropdown de salas do sponsor para o form de alocação
    const roomName = (id: string) => {
        const r = rooms.find(r => String(r.room_id) === id);
        return r ? (r.metadata?.name ?? `Sala #${id}`) : `#${id}`;
    };

    return (
        <div>
            <h2 className="text-xl font-bold text-[--cb-text-primary] mb-1">{t('sponsor.vault_title')}</h2>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('sponsor.vault_desc')}</p>

            {error && (
                <div className="cb-alert cb-alert-error mb-4 flex items-center gap-2">
                    <span>⚠️ {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}
            {success && (
                <div data-testid="sponsor-vault-toast-success" className="cb-alert cb-alert-success mb-4 flex items-center gap-2">
                    <span>✓ {success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm">✕</button>
                </div>
            )}

            {/* ── Tabs + Alocar ── */}
            <div className="flex gap-2 mb-6 flex-wrap">
                <button
                    className={`cb-btn cb-btn-sm ${tab === 'deposits' ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                    data-testid="sponsor-vault-tab-deposits"
                    onClick={() => setTab('deposits')}
                >
                    {t('admin.vault_deposits')} ({deposits.length})
                </button>
                <button
                    className={`cb-btn cb-btn-sm ${tab === 'allocations' ? 'cb-btn-primary' : 'cb-btn-outline'}`}
                    data-testid="sponsor-vault-tab-allocations"
                    onClick={() => setTab('allocations')}
                >
                    {t('admin.vault_allocations')} ({allocations.length})
                </button>
                <button
                    className="cb-btn cb-btn-primary cb-btn-sm ml-auto"
                    data-testid="sponsor-vault-allocate-toggle"
                    onClick={() => setShowAllocate(!showAllocate)}
                    disabled={rooms.length === 0}
                >
                    {showAllocate ? t('common.cancel') : t('sponsor.vault_allocate_new')}
                </button>
            </div>

            {/* ── Form de alocação ── */}
            {showAllocate && (
                <div className="cb-card p-4 mb-6" style={{ maxWidth: '36rem' }}>
                    <h3 className="font-bold text-[--cb-text-primary] mb-3">{t('admin.vault_allocate_title')}</h3>
                    <div className="grid gap-3">
                        {/* Deposit — dropdown dos seus depósitos disponíveis */}
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_deposit_id')}</span>
                            <select
                                className="cb-input cb-select"
                                data-testid="sponsor-vault-field-deposit_id"
                                value={allocForm.deposit_id}
                                onChange={e => {
                                    const dep = deposits.find(d => String(d.deposit_id) === e.target.value);
                                    const autoQty = dep?.quantity_remaining?.quantity
                                        ? defaultQtyPerDrop(dep.quantity_remaining.quantity)
                                        : '';
                                    setAllocForm(f => ({ ...f, deposit_id: e.target.value, quantity_per_drop: autoQty }));
                                }}
                            >
                                <option value="">{t('sponsor.select_deposit')}</option>
                                {deposits.filter(d => d.status === 'available' || d.status === 'deposited' || d.status === 'active').map(d => (
                                    <option key={d.deposit_id} value={d.deposit_id}>
                                        #{d.deposit_id} — {d.asset_type === 'nft' ? `NFT #${d.nft_asset_id}` : d.quantity_remaining.quantity}
                                    </option>
                                ))}
                            </select>
                        </label>

                        {/* Sala — dropdown das suas salas */}
                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_room_id')}</span>
                            <select
                                className="cb-input cb-select"
                                data-testid="sponsor-vault-room-select"
                                value={allocForm.room_id}
                                onChange={e => setAllocForm(f => ({ ...f, room_id: e.target.value }))}
                            >
                                <option value="">{t('sponsor.select_room')}</option>
                                {rooms.map(r => (
                                    <option key={r.room_id} value={String(r.room_id)}>
                                        {roomName(String(r.room_id))} (#{r.room_id})
                                    </option>
                                ))}
                            </select>
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">{t('admin.vault_qty_per_drop')}</span>
                            <input
                                className="cb-input"
                                data-testid="sponsor-vault-field-quantity_per_drop"
                                placeholder="10.0000 WAX (vazio = 1 NFT)"
                                value={allocForm.quantity_per_drop}
                                onChange={e => setAllocForm(f => ({ ...f, quantity_per_drop: e.target.value }))}
                            />
                        </label>

                        <label className="flex flex-col gap-1">
                            <span className="text-xs text-[--cb-text-tertiary]">
                                {t('admin.vault_chance_bps')} — {(allocForm.drop_chance_bps / 100).toFixed(2)}%
                            </span>
                            <input
                                className="cb-input"
                                data-testid="sponsor-vault-field-drop_chance_bps"
                                type="range"
                                min={100}
                                max={10000}
                                step={100}
                                value={allocForm.drop_chance_bps}
                                onChange={e => setAllocForm(f => ({ ...f, drop_chance_bps: parseInt(e.target.value) }))}
                                style={{ padding: 0 }}
                            />
                            <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                <span>1%</span><span>50%</span><span>100%</span>
                            </div>
                        </label>

                        <button
                            className="cb-btn cb-btn-primary"
                            data-testid="sponsor-vault-allocate"
                            disabled={allocSubmitting || !allocForm.deposit_id || !allocForm.room_id}
                            onClick={handleAllocate}
                        >
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
                    {deposits.map(d => (
                        <div key={d.deposit_id} data-testid={`sponsor-deposit-${d.deposit_id}`} className="cb-card p-4 flex flex-col gap-2">
                            <div className="flex items-start justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-[--cb-text-primary]">#{d.deposit_id}</span>
                                    {statusBadge(d.status)}
                                </div>
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
                                <div className="text-xs text-[--cb-text-tertiary]">{d.token_symbol} ({d.token_contract})</div>
                            )}
                            {d.asset_type === 'nft' && (
                                <div className="text-xs text-[--cb-text-tertiary]">
                                    NFT #{d.nft_asset_id} · template #{d.nft_template_id} · {d.nft_collection}
                                </div>
                            )}
                            <button
                                className="cb-btn cb-btn-outline cb-btn-sm text-xs mt-2 w-fit"
                                disabled={reclaiming === d.deposit_id}
                                onClick={() => handleReclaim(d.deposit_id)}
                            >
                                {reclaiming === d.deposit_id ? t('common.syncing') : t('admin.vault_reclaim')}
                            </button>
                        </div>
                    ))}
                    {deposits.length === 0 && (
                        <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.vault_empty_deposits')}</p>
                    )}
                </div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(28rem, 1fr))' }}>
                    {allocations.map(a => (
                        <div key={a.alloc_id} data-testid={`sponsor-alloc-${a.alloc_id}`} className="cb-card p-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-[--cb-text-primary]">Alloc #{a.alloc_id}</span>
                                    {statusBadge(a.status)}
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_room')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{roomName(a.room_id)} (#{a.room_id})</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_per_drop')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{a.quantity_per_drop.quantity}</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_chance')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{(a.drop_chance_bps / 100).toFixed(2)}%</span>
                                </div>
                                <div className="bg-[--cb-bg-surface] p-2 rounded">
                                    <span className="text-[--cb-text-tertiary] block">{t('admin.vault_executed')}</span>
                                    <span className="font-mono text-[--cb-text-primary]">{a.drops_executed}</span>
                                </div>
                            </div>
                            {a.status === 'active' && (
                                <button
                                    className="cb-btn cb-btn-danger cb-btn-sm text-xs mt-2 w-fit"
                                    disabled={deallocating === a.alloc_id}
                                    onClick={() => handleDeallocate(a.alloc_id)}
                                >
                                    {deallocating === a.alloc_id ? t('common.syncing') : t('admin.vault_deallocate')}
                                </button>
                            )}
                        </div>
                    ))}
                    {allocations.length === 0 && (
                        <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.vault_empty_allocations')}</p>
                    )}
                </div>
            )}
        </div>
    );
}
