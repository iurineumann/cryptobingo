import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedRoom, RoomDropConfig, BlockchainGametype } from '../../services/api';
import {
    fetchRooms, createAdminRoom, updateRoomMetadata,
    activateRoom, pauseRoom, closeRoom, fetchAdminGametypes,
    updateRoomSettings,
} from '../../services/api';

interface DropForm {
    token_contract:    string;
    symbol:            string;
    amount:            string;
    drop_chance_pct:   number;
    max_drops_per_game: number;
}

interface CreateForm {
    room_id: number;
    sponsor: string;
    gametype_id: number;
    currency_quantity: string;
    currency_contract: string;
    ticket_price_min_quantity: string;
    ticket_price_min_contract: string;
    ticket_price_max_quantity: string;
    ticket_price_max_contract: string;
    ticket_price_default_quantity: string;
    ticket_price_default_contract: string;
    max_tickets_per_player: number;
    name: string;
    description: string;
    drops: DropForm[];
    auto_start_delay_sec: number;
    chat_enabled: boolean;
}

interface EditForm {
    name: string;
    description: string;
    auto_start_delay_sec: number;
    chat_enabled: boolean;
    max_tickets_per_player: number;
}

const defaultForm: CreateForm = {
    room_id: 0, sponsor: '', gametype_id: 0,
    currency_quantity: '0.0000 BINGO', currency_contract: 'bingogametkn',
    ticket_price_min_quantity: '0.0000 BINGO', ticket_price_min_contract: 'bingogametkn',
    ticket_price_max_quantity: '0.0000 BINGO', ticket_price_max_contract: 'bingogametkn',
    ticket_price_default_quantity: '0.0000 BINGO', ticket_price_default_contract: 'bingogametkn',
    max_tickets_per_player: 0,
    name: '', description: '',
    drops: [], auto_start_delay_sec: 30, chat_enabled: true,
};

const defaultEditForm: EditForm = {
    name: '', description: '',
    auto_start_delay_sec: 30, chat_enabled: true,
    max_tickets_per_player: 10,
};

export default function RoomsAdmin() {
    const { t } = useTranslation();
    const [rooms,          setRooms]          = useState<EnrichedRoom[]>([]);
    const [loading,        setLoading]        = useState(true);
    const [error,          setError]          = useState<string | null>(null);
    const [success,        setSuccess]        = useState<string | null>(null);
    const [showCreate,     setShowCreate]     = useState(false);
    const [form,           setForm]           = useState<CreateForm>(defaultForm);
    const [editTarget,     setEditTarget]     = useState<EnrichedRoom | null>(null);
    const [editForm,       setEditForm]       = useState<EditForm>(defaultEditForm);
    const [gametypes,      setGametypes]      = useState<BlockchainGametype[]>([]);
    const [submitting,     setSubmitting]     = useState(false);
    const [editSubmitting, setEditSubmitting] = useState(false);
    const [closeTarget,    setCloseTarget]    = useState<EnrichedRoom | null>(null);

    const loadGametypes = useCallback(async () => {
        try {
            const res = await fetchAdminGametypes();
            setGametypes(res.gametypes);
        } catch { /* não crítico */ }
    }, []);

    const loadRooms = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchRooms();
            setRooms(res.rooms);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_load'));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadRooms(); loadGametypes(); }, [loadRooms, loadGametypes]);

    useEffect(() => {
        if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
    }, [success]);

    useEffect(() => {
        if (error) { const t = setTimeout(() => setError(null), 3000); return () => clearTimeout(t); }
    }, [error]);

    const handleCreate = async () => {
        if (form.room_id === 0) { setError(t('admin.rooms_required_room_id')); return; }
        setSubmitting(true);
        setError(null);
        try {
            await createAdminRoom({
                room_id: form.room_id,
                sponsor: form.sponsor || undefined,
                gametype_id: form.gametype_id || undefined,
                currency_quantity: form.currency_quantity,
                currency_contract: form.currency_contract,
                ticket_price_min_quantity: form.ticket_price_min_quantity,
                ticket_price_min_contract: form.ticket_price_min_contract,
                ticket_price_max_quantity: form.ticket_price_max_quantity,
                ticket_price_max_contract: form.ticket_price_max_contract,
                ticket_price_default_quantity: form.ticket_price_default_quantity,
                ticket_price_default_contract: form.ticket_price_default_contract,
                max_tickets_per_player: form.max_tickets_per_player || 0,
                name: form.name || undefined,
                description: form.description || undefined,
                auto_start_delay_sec: form.auto_start_delay_sec || 30,
                chat_enabled: form.chat_enabled,
                drops: form.drops.length > 0 ? form.drops as RoomDropConfig[] : undefined,
            });
            setSuccess(t('admin.rooms_success_create', { id: form.room_id }));
            setShowCreate(false);
            setForm(defaultForm);
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_create'));
        } finally {
            setSubmitting(false);
        }
    };

    const handleActivate = async (roomId: string) => {
        try {
            await activateRoom(roomId);
            setSuccess(t('admin.rooms_success_activate', { id: roomId }));
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_activate'));
        }
    };

    const handlePause = async (roomId: string) => {
        try {
            await pauseRoom(roomId);
            setSuccess(t('admin.rooms_success_pause', { id: roomId }));
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_pause'));
        }
    };

    const handleClose = async (roomId: string) => {
        try {
            await closeRoom(roomId);
            setSuccess(t('admin.rooms_success_close', { id: roomId }));
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_close'));
        }
    };

    const openEdit = (room: EnrichedRoom) => {
        setEditTarget(room);
        setEditForm({
            name: room.metadata?.name ?? '',
            description: room.metadata?.description ?? '',
            auto_start_delay_sec: room.metadata?.auto_start_delay_sec ?? 30,
            chat_enabled: room.metadata?.chat_enabled ?? true,
            max_tickets_per_player: room.max_tickets_per_player ?? 10,
        });
    };

    const handleEdit = async () => {
        if (!editTarget) return;
        setEditSubmitting(true);
        setError(null);
        try {
            await updateRoomMetadata(editTarget.room_id, {
                name: editForm.name,
                description: editForm.description,
                auto_start_delay_sec: editForm.auto_start_delay_sec,
                chat_enabled: editForm.chat_enabled,
            });
        } catch (err) {
            setError(err instanceof Error ? err.message : t('admin.rooms_error_edit'));
            setEditSubmitting(false);
            return;
        }

        // Atualiza config on-chain (não bloqueia o sucesso da metadata)
        let settingsWarning = '';
        try {
            await updateRoomSettings(editTarget.room_id, {
                max_tickets_per_player: editForm.max_tickets_per_player,
            });
        } catch (err) {
            settingsWarning = ` (${t('admin.rooms_error_settings')})`;
        }

        setSuccess(t('admin.rooms_success_edit', { id: editTarget.room_id }) + settingsWarning);
        setEditTarget(null);
        setEditSubmitting(false);
        await loadRooms();
    };

    return (
        <section>
            <div className="flex items-center justify-between mb-4">
                <button className="cb-btn cb-btn-primary cb-btn-sm" data-testid="rooms-new" onClick={() => setShowCreate(s => !s)}>
                    {showCreate ? t('admin.rooms_cancel') : t('admin.rooms_new')}
                </button>
            </div>

            {error && <div className="cb-alert cb-alert-error mb-3" data-testid="rooms-toast-error">{error}</div>}
            {success && <div className="cb-alert cb-alert-success mb-3" data-testid="rooms-toast-success">{success}</div>}

            {/* ── Create Form ── */}
            {showCreate && (
                <div className="cb-card mb-4 p-4 space-y-3">
                    <h3 className="font-bold text-sm">{t('admin.rooms_new')}</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_room_id')}
                            <input className="cb-input w-full mt-1" type="number" data-testid="rooms-field-room_id" value={form.room_id || ''}
                                onChange={e => setForm(f => ({ ...f, room_id: parseInt(e.target.value) || 0 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_sponsor')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-sponsor" value={form.sponsor}
                                onChange={e => setForm(f => ({ ...f, sponsor: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_gametype')}
                            <select className="cb-input w-full mt-1" data-testid="rooms-field-gametype_id" value={form.gametype_id}
                                onChange={e => setForm(f => ({ ...f, gametype_id: parseInt(e.target.value) || 0 }))}
                            >
                                <option value="">— {t('admin.rooms_form_gametype_select')} —</option>
                                {gametypes.map(gt => (
                                    <option key={gt.gametype_id} value={gt.gametype_id}>
                                        #{gt.gametype_id} — {gt.name}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_currency')}
                            <input className="cb-input w-full mt-1" value={form.currency_quantity}
                                onChange={e => setForm(f => ({ ...f, currency_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_currency_contract')}
                            <input className="cb-input w-full mt-1" value={form.currency_contract}
                                onChange={e => setForm(f => ({ ...f, currency_contract: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_price_min')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-price_min" value={form.ticket_price_min_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_min_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_price_max')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-price_max" value={form.ticket_price_max_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_max_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_price_default')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-price_default" value={form.ticket_price_default_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_default_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_max_tickets')}
                            <input className="cb-input w-full mt-1" type="number" data-testid="rooms-field-max_tickets" value={form.max_tickets_per_player}
                                onChange={e => setForm(f => ({ ...f, max_tickets_per_player: parseInt(e.target.value) || 0 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_meta_name')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-name" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_meta_description')}
                            <input className="cb-input w-full mt-1" data-testid="rooms-field-description" value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            {t('admin.rooms_form_auto_start')}
                            <input className="cb-input w-full mt-1" type="number" data-testid="rooms-field-auto_start_delay" value={form.auto_start_delay_sec}
                                onChange={e => setForm(f => ({ ...f, auto_start_delay_sec: parseInt(e.target.value) || 30 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary] flex items-center gap-2 mt-4">
                            <input type="checkbox" data-testid="rooms-field-chat_enabled" checked={form.chat_enabled}
                                onChange={e => setForm(f => ({ ...f, chat_enabled: e.target.checked }))} />
                            {t('admin.rooms_form_chat')}
                        </label>
                    </div>
                    <button className="cb-btn cb-btn-primary mt-2" data-testid="rooms-create" onClick={handleCreate} disabled={submitting}>
                        {submitting ? t('admin.rooms_creating') : t('admin.rooms_create')}
                    </button>
                </div>
            )}

            {/* ── Room List ── */}
            {loading ? (
                <div className="flex justify-center py-8"><span className="cb-spinner w-8 h-8" /></div>
            ) : rooms.length === 0 ? (
                <p className="text-sm text-[--cb-text-tertiary] py-8 text-center">{t('admin.rooms_empty')}</p>
            ) : (
                <div className="space-y-3">
                    {rooms.map(room => (
                        <div key={room.room_id} data-testid={`room-card-${room.room_id}`} className="cb-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-bold text-[--cb-text-primary]">
                                        {room.metadata?.name ?? `${t('game_room.breadcrumb_room')} #${room.room_id}`}
                                    </h3>
                                    <p className="text-xs text-[--cb-text-tertiary] mt-1">
                                        Room ID: {room.room_id} | Sponsor: {room.sponsor}
                                        {room.sponsor_room ? ` (${t('admin.rooms_sponsored')})` : ''}
                                        {' | '}Status: {room.status}
                                        {String(room.current_game_id) !== '0' && ` | Game: #${room.current_game_id}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {(room.status === 'inactive' || room.status === 'paused') && (
                                        <button className="cb-btn cb-btn-primary cb-btn-xs" data-testid={`room-activate-${room.room_id}`} onClick={() => handleActivate(room.room_id)}>
                                            {t('admin.rooms_activate')}
                                        </button>
                                    )}
                                    {room.status === 'active' && (
                                        <button className="cb-btn cb-btn-outline cb-btn-xs" data-testid={`room-pause-${room.room_id}`} onClick={() => handlePause(room.room_id)}>
                                            {t('admin.rooms_pause')}
                                        </button>
                                    )}
                                    {(room.status === 'active' || room.status === 'paused') && (
                                        <button className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]" data-testid={`room-close-${room.room_id}`} onClick={() => setCloseTarget(room)}>
                                            {t('admin.rooms_close')}
                                        </button>
                                    )}
                                    {room.status !== 'closed' && (
                                        <button className="cb-btn cb-btn-outline cb-btn-xs" data-testid={`room-edit-${room.room_id}`} onClick={() => openEdit(room)}>
                                            {t('admin.rooms_edit')}
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-[--cb-text-secondary]">
                                <span>Min: {room.ticket_price_min.quantity}</span>
                                <span>Max: {room.ticket_price_max.quantity}</span>
                                <span>Default: {room.ticket_price_default.quantity}</span>
                                <span>Max/jogador: {room.max_tickets_per_player || '∞'}</span>
                                <span>Delay: {room.metadata?.auto_start_delay_sec ?? 30}s</span>
                                <span>Chat: {room.metadata?.chat_enabled !== false ? '✅' : '❌'}</span>
                                <span>Drops: {room.metadata?.drops?.length ?? 0}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* ── Edit Modal ── */}
            {editTarget && (
                <div data-testid="modal-backdrop" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEditTarget(null)}>
                    <div className="cb-card p-6 max-w-lg w-full mx-4 space-y-3" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-sm">{t('admin.rooms_edit_title', { id: editTarget.room_id })}</h3>
                        <div className="grid grid-cols-2 gap-3">
                            <label className="text-xs text-[--cb-text-tertiary]">
                                {t('admin.rooms_meta_name')}
                                <input className="cb-input w-full mt-1" value={editForm.name}
                                    onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))} />
                            </label>
                            <label className="text-xs text-[--cb-text-tertiary]">
                                {t('admin.rooms_meta_description')}
                                <input className="cb-input w-full mt-1" value={editForm.description}
                                    onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))} />
                            </label>
                            <label className="text-xs text-[--cb-text-tertiary]">
                                {t('admin.rooms_form_auto_start')}
                                <input className="cb-input w-full mt-1" type="number" value={editForm.auto_start_delay_sec}
                                    onChange={e => setEditForm(f => ({ ...f, auto_start_delay_sec: parseInt(e.target.value) || 30 }))} />
                            </label>
                            <label className="text-xs text-[--cb-text-tertiary]">
                                {t('admin.rooms_form_max_tickets')}
                                <input className="cb-input w-full mt-1" type="number" value={editForm.max_tickets_per_player}
                                    onChange={e => setEditForm(f => ({ ...f, max_tickets_per_player: parseInt(e.target.value) || 10 }))} />
                            </label>
                            <label className="text-xs text-[--cb-text-tertiary] flex items-center gap-2 mt-4">
                                <input type="checkbox" checked={editForm.chat_enabled}
                                    onChange={e => setEditForm(f => ({ ...f, chat_enabled: e.target.checked }))} />
                                {t('admin.rooms_form_chat')}
                            </label>
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => setEditTarget(null)}>
                                {t('admin.rooms_cancel')}
                            </button>
                            <button data-testid="room-save" className="cb-btn cb-btn-primary cb-btn-sm" onClick={handleEdit} disabled={editSubmitting}>
                                {editSubmitting ? t('admin.rooms_saving') : t('admin.rooms_save')}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Close Confirmation Modal ── */}
            {closeTarget && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCloseTarget(null)}>
                    <div className="cb-card p-6 max-w-md w-full mx-4 space-y-4" onClick={e => e.stopPropagation()}>
                        <h3 className="font-bold text-sm text-[--cb-danger]">{t('admin.rooms_close_warning_title')}</h3>
                        <p className="text-sm text-[--cb-text-secondary]">
                            {t('admin.rooms_close_warning_body', { name: closeTarget.metadata?.name ?? `#${closeTarget.room_id}` })}
                        </p>
                        <p className="text-xs font-bold text-[--cb-danger]">{t('admin.rooms_close_warning_irreversible')}</p>
                        <div className="flex justify-end gap-2">
                            <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={() => setCloseTarget(null)}>
                                {t('admin.rooms_cancel')}
                            </button>
                            <button className="cb-btn cb-btn-danger cb-btn-sm" data-testid="room-close-confirm" onClick={() => { handleClose(closeTarget.room_id); setCloseTarget(null); }}>
                                {t('admin.rooms_close_confirm')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
