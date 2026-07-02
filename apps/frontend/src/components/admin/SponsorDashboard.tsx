import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, TriangleAlert, Check } from 'lucide-react';
import type { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import {
    fetchCampaigns, closeCampaign, fetchSponsorRooms, fetchRooms, fetchRoomTreasury,
    type BlockchainCampaign, type EnrichedRoom, type RoomTreasury,
} from '../../services/api';

interface SponsorDashboardProps { readonly session?: Session }

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';

export default function SponsorDashboard({ session }: SponsorDashboardProps) {
    const { t } = useTranslation();
    const [campaigns,  setCampaigns]  = useState<BlockchainCampaign[]>([]);
    const [rooms,      setRooms]      = useState<EnrichedRoom[]>([]);
    const [treasuries, setTreasuries] = useState<Record<string, RoomTreasury | null>>({});
    const [loading,    setLoading]    = useState(true);
    const [error,      setError]      = useState<string | null>(null);
    const [success,    setSuccess]    = useState<string | null>(null);

    // depósito / saque por sala
    const [depositAmounts,  setDepositAmounts]  = useState<Record<string, string>>({});
    const [withdrawAmounts, setWithdrawAmounts] = useState<Record<string, string>>({});
    const [txPending,       setTxPending]       = useState<Record<string, boolean>>({});

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [cData] = await Promise.all([fetchCampaigns()]);
            setCampaigns(cData.campaigns);
            let roomData;
            try {
                roomData = await fetchSponsorRooms();
            } catch {
                roomData = await fetchRooms();
            }
            setRooms(roomData.rooms);

            const treasuryEntries = await Promise.all(
                roomData.rooms
                    .filter(r => r.sponsor_room)
                    .map(async r => {
                        try {
                            const { treasury } = await fetchRoomTreasury(r.room_id);
                            return [r.room_id, treasury] as [string, RoomTreasury | null];
                        } catch {
                            return [r.room_id, null] as [string, null];
                        }
                    })
            );
            setTreasuries(Object.fromEntries(treasuryEntries));
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.campaigns_error_load'));
        } finally {
            setLoading(false);
        }
    }, [t]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleCloseCampaign = async (id: string) => {
        if (!confirm(t('admin.campaigns_confirm_close', { id }))) return;
        try {
            await closeCampaign(id);
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.campaigns_error_close'));
        }
    };

    // Depósito: transfer direto com memo "room:<id>" via Wharfkit session do sponsor
    const handleDeposit = async (room: EnrichedRoom) => {
        if (!session) return;
        const treasury = treasuries[room.room_id];
        const amountStr = depositAmounts[room.room_id]?.trim();
        if (!amountStr || !treasury) return;

        const qty = `${Number.parseFloat(amountStr).toFixed(
            treasury.balance.quantity.split(' ')[0].includes('.') ? treasury.balance.quantity.split(' ')[0].split('.')[1].length : 4
        )} ${treasury.balance.quantity.split(' ')[1]}`;

        setTxPending(p => ({ ...p, [`dep-${room.room_id}`]: true }));
        setError(null);
        try {
            await session.transact({
                actions: [{
                    account:       treasury.balance.contract,
                    name:          'transfer',
                    authorization: [session.permissionLevel],
                    data: {
                        from:     String(session.actor),
                        to:       CONTRACT_ACCOUNT,
                        quantity: qty,
                        memo:     `room:${room.room_id}`,
                    },
                }],
            }, { broadcast: true });
            setSuccess(t('admin.treasury_success_deposit'));
            setDepositAmounts(a => ({ ...a, [room.room_id]: '' }));
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.treasury_error_deposit'));
        } finally {
            setTxPending(p => ({ ...p, [`dep-${room.room_id}`]: false }));
        }
    };

    // Saque: withdrawroom action assinada diretamente pelo sponsor via Wharfkit
    const handleWithdraw = async (room: EnrichedRoom) => {
        if (!session) return;
        const treasury = treasuries[room.room_id];
        const amountStr = withdrawAmounts[room.room_id]?.trim();
        if (!amountStr || !treasury) return;

        const precision = treasury.balance.quantity.split(' ')[0].includes('.')
            ? treasury.balance.quantity.split(' ')[0].split('.')[1].length : 4;
        const sym = treasury.balance.quantity.split(' ')[1];
        const qty = `${Number.parseFloat(amountStr).toFixed(precision)} ${sym}`;

        setTxPending(p => ({ ...p, [`wd-${room.room_id}`]: true }));
        setError(null);
        try {
            await session.transact({
                actions: [{
                    account:       CONTRACT_ACCOUNT,
                    name:          'withdrawroom',
                    authorization: [session.permissionLevel],
                    data: {
                        room_id: UInt64.from(room.room_id),
                        amount: { quantity: qty, contract: treasury.balance.contract },
                    },
                }],
            }, { broadcast: true });
            setSuccess(t('admin.treasury_success_withdraw'));
            setWithdrawAmounts(a => ({ ...a, [room.room_id]: '' }));
            await loadData();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.treasury_error_withdraw'));
        } finally {
            setTxPending(p => ({ ...p, [`wd-${room.room_id}`]: false }));
        }
    };

    const BudgetBar = ({ used, total }: { used: number; total: number }) => {
        const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
        return (
            <div className="w-full bg-[--cb-bg-surface] rounded-full h-2 mt-1">
                <div className="h-full rounded-full bg-gradient-to-r from-[--cb-brand] to-[--cb-accent]" style={{ width: `${pct}%` }} />
            </div>
        );
    };

    return (
        <div className="space-y-8">
            {error && (
                <div className="cb-alert cb-alert-error">
                    <span><TriangleAlert className="size-4 shrink-0" /> {error}</span>
                    <button onClick={() => setError(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}
            {success && (
                <div className="cb-alert cb-alert-success">
                    <span>{success}</span>
                    <button onClick={() => setSuccess(null)} className="ml-auto text-sm"><X className="size-4 shrink-0" /></button>
                </div>
            )}

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-4">
                    <span className="cb-spinner w-4 h-4" />
                    <span>{t('common.loading')}</span>
                </div>
            ) : (
                <>
                    {/* ── Salas + Treasury ── */}
                    {rooms.some(r => r.sponsor_room) && (
                        <section>
                            <h3 className="text-sm font-semibold text-[--cb-text-secondary] mb-3">
                                {t('admin.treasury_title')}
                            </h3>
                            <div className="space-y-4">
                                {rooms.filter(r => r.sponsor_room).map(room => {
                                    const treasury = treasuries[room.room_id];
                                    const bal  = Number.parseFloat(treasury?.balance.quantity ?? '0') || 0;
                                    const lock = Number.parseFloat(treasury?.locked.quantity  ?? '0') || 0;
                                    const sym  = treasury?.balance.quantity.split(' ')[1] ?? '';
                                    const prec = treasury?.balance.quantity.split(' ')[0].includes('.')
                                        ? treasury?.balance.quantity.split(' ')[0].split('.')[1].length : 4;

                                    return (
                                        <div key={room.room_id} className="cb-card p-4 space-y-3"
                                            data-testid={`treasury-card-${room.room_id}`}>
                                            <div className="flex items-center justify-between">
                                                <span className="font-bold text-sm text-[--cb-text-primary]">
                                                    {room.metadata?.name ?? `Room #${room.room_id}`}
                                                </span>
                                                <span className={`cb-badge text-xs ${room.status === 'active' ? 'cb-badge-success' : 'cb-badge-neutral'}`}>
                                                    {room.status}
                                                </span>
                                            </div>

                                            {treasury ? (
                                                <div className="grid grid-cols-2 gap-2 text-xs">
                                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                                        <span className="text-[--cb-text-tertiary] block">{t('admin.treasury_balance')}</span>
                                                        <span className="font-mono font-bold text-[--cb-text-primary]">{treasury.balance.quantity}</span>
                                                    </div>
                                                    <div className="bg-[--cb-bg-surface] p-2 rounded">
                                                        <span className="text-[--cb-text-tertiary] block">{t('admin.treasury_locked')}</span>
                                                        <span className="font-mono text-[--cb-text-secondary]">{treasury.locked.quantity}</span>
                                                    </div>
                                                </div>
                                            ) : (
                                                <p className="text-xs text-[--cb-text-tertiary]">{t('admin.treasury_empty')}</p>
                                            )}

                                            {session && (
                                                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[--cb-border]">
                                                    {/* Depósito */}
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.treasury_deposit_amount')}</label>
                                                        <div className="flex gap-1">
                                                            <input className="cb-input flex-1 text-xs"
                                                                type="number" min="0" step={Math.pow(10, -prec).toFixed(prec)}
                                                                placeholder={`0.${'0'.repeat(prec)} ${sym}`}
                                                                value={depositAmounts[room.room_id] ?? ''}
                                                                onChange={e => setDepositAmounts(a => ({ ...a, [room.room_id]: e.target.value }))}
                                                                data-testid={`treasury-deposit-input-${room.room_id}`} />
                                                            <button className="cb-btn cb-btn-primary cb-btn-xs"
                                                                onClick={() => handleDeposit(room)}
                                                                disabled={!treasury || txPending[`dep-${room.room_id}`]}
                                                                data-testid={`treasury-deposit-btn-${room.room_id}`}>
                                                                {txPending[`dep-${room.room_id}`] ? '...' : t('admin.treasury_deposit')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                    {/* Saque */}
                                                    <div className="space-y-1">
                                                        <label className="text-xs text-[--cb-text-tertiary]">{t('admin.treasury_withdraw_amount')}</label>
                                                        <div className="flex gap-1">
                                                            <input className="cb-input flex-1 text-xs"
                                                                type="number" min="0" max={bal - lock}
                                                                step={Math.pow(10, -prec).toFixed(prec)}
                                                                placeholder={`max ${(bal - lock).toFixed(prec)} ${sym}`}
                                                                value={withdrawAmounts[room.room_id] ?? ''}
                                                                onChange={e => setWithdrawAmounts(a => ({ ...a, [room.room_id]: e.target.value }))}
                                                                data-testid={`treasury-withdraw-input-${room.room_id}`} />
                                                            <button className="cb-btn cb-btn-outline cb-btn-xs"
                                                                onClick={() => handleWithdraw(room)}
                                                                disabled={!treasury || bal - lock <= 0 || txPending[`wd-${room.room_id}`]}
                                                                data-testid={`treasury-withdraw-btn-${room.room_id}`}>
                                                                {txPending[`wd-${room.room_id}`] ? '...' : t('admin.treasury_withdraw')}
                                                            </button>
                                                        </div>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* ── Campanhas ── */}
                    <section>
                        <p className="text-sm text-[--cb-text-tertiary] mb-4">{t('admin.campaigns_desc')}</p>
                        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(26rem, 1fr))' }}>
                            {campaigns.map(c => {
                                const budget    = Number.parseFloat(c.budget.quantity) || 0;
                                const remaining = Number.parseFloat(c.remaining.quantity) || 0;
                                const used      = budget - remaining;
                                return (
                                    <div key={c.campaign_id} className="cb-card p-4 flex flex-col gap-3">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <span className="font-bold text-[--cb-text-primary]">Campanha #{c.campaign_id}</span>
                                                <span className={`cb-badge ml-2 text-xs ${c.status === 'active' ? 'cb-badge-success' : c.status === 'closed' ? 'cb-badge-danger' : 'cb-badge-neutral'}`}>{c.status}</span>
                                            </div>
                                            {c.status !== 'closed' && (
                                                <button className="text-xs text-[--cb-danger] hover:underline" onClick={() => handleCloseCampaign(c.campaign_id)}>
                                                    {t('admin.campaigns_close')}
                                                </button>
                                            )}
                                        </div>
                                        <div className="grid grid-cols-2 gap-3 text-xs">
                                            <div className="bg-[--cb-bg-surface] p-2 rounded">
                                                <span className="text-[--cb-text-tertiary] block">{t('admin.campaigns_sponsor')}</span>
                                                <span className="font-mono text-[--cb-text-primary]">{c.sponsor}</span>
                                            </div>
                                            <div className="bg-[--cb-bg-surface] p-2 rounded">
                                                <span className="text-[--cb-text-tertiary] block">{t('admin.campaigns_payout')}</span>
                                                <span className="font-mono text-[--cb-text-primary]">{c.payout_per_game.quantity}</span>
                                            </div>
                                        </div>
                                        <div>
                                            <div className="flex justify-between text-xs text-[--cb-text-tertiary]">
                                                <span>{t('admin.campaigns_budget')}<strong className="text-[--cb-text-primary]">{c.budget.quantity}</strong></span>
                                                <span>{t('admin.campaigns_remaining')}<strong className="text-[--cb-text-primary]">{c.remaining.quantity}</strong></span>
                                            </div>
                                            <BudgetBar used={used} total={budget} />
                                        </div>
                                        <span className="text-xs text-[--cb-text-tertiary]">{t('admin.campaigns_leftover')}{c.leftover_policy}</span>
                                    </div>
                                );
                            })}
                            {campaigns.length === 0 && (
                                <p className="text-[--cb-text-tertiary] text-sm col-span-full">{t('admin.campaigns_empty')}</p>
                            )}
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
