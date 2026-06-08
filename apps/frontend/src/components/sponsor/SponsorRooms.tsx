// apps/frontend/src/components/sponsor/SponsorRooms.tsx
// Painel do sponsor para visualizar e editar as suas salas.
// Dados via fetchSponsorRooms() — filtrado server-side pelo JWT do sponsor.
// Edição limitada a metadata off-chain (nome, descrição, delay, chat).

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    fetchSponsorRooms,
    updateRoomMetadata,
    type EnrichedRoom,
} from '../../services/api';

function fmtQty(qty: string | undefined): string {
    if (!qty) return '—';
    const parts = qty.split(' ');
    return parts.length === 2 ? `${parseFloat(parts[0]).toFixed(4)} ${parts[1]}` : qty;
}

const STATUS_EMOJI: Record<string, string> = {
    inactive: '⚫', active: '🟢', paused: '🟡', closed: '🔴',
};

interface EditForm {
    name:                string;
    description:         string;
    auto_start_delay_sec: number;
    chat_enabled:        boolean;
}

export default function SponsorRooms() {
    const { t }    = useTranslation();
    const navigate = useNavigate();

    const [rooms,     setRooms]     = useState<EnrichedRoom[]>([]);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState<string | null>(null);
    const [success,   setSuccess]   = useState<string | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editForm,  setEditForm]  = useState<EditForm>({ name: '', description: '', auto_start_delay_sec: 30, chat_enabled: true });
    const [saving,    setSaving]    = useState(false);

    const load = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchSponsorRooms();
            setRooms(data.rooms);
        } catch (err) {
            setError(err instanceof Error ? err.message : t('sponsor.error_load'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    function startEdit(room: EnrichedRoom) {
        setEditingId(String(room.room_id));
        setEditForm({
            name:                room.metadata?.name ?? '',
            description:         room.metadata?.description ?? '',
            auto_start_delay_sec: room.metadata?.auto_start_delay_sec ?? 30,
            chat_enabled:        room.metadata?.chat_enabled ?? true,
        });
        setSuccess(null);
        setError(null);
    }

    async function saveEdit(roomId: string) {
        setSaving(true);
        setError(null);
        try {
            await updateRoomMetadata(roomId, {
                name:                editForm.name || undefined,
                description:         editForm.description || undefined,
                auto_start_delay_sec: editForm.auto_start_delay_sec,
                chat_enabled:        editForm.chat_enabled,
            });
            setSuccess(t('sponsor.success_update'));
            setEditingId(null);
            await load();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('sponsor.error_update'));
        } finally {
            setSaving(false);
        }
    }

    const dropsCount = (room: EnrichedRoom) => room.metadata?.drops?.length ?? 0;
    const hasNftDrop   = (room: EnrichedRoom) => room.metadata?.drops?.some(d => d.template_id != null) ?? false;
    const hasTokenDrop = (room: EnrichedRoom) => room.metadata?.drops?.some(d => d.amount != null)       ?? false;

    return (
        <div>
            <h2 className="text-xl font-bold text-[--cb-text-primary] mb-1">{t('sponsor.rooms_title')}</h2>
            <p className="text-sm text-[--cb-text-tertiary] mb-6">{t('sponsor.rooms_desc')}</p>

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

            {loading ? (
                <div className="flex items-center gap-2 text-[--cb-text-tertiary] py-8">
                    <span className="cb-spinner w-5 h-5" />
                    <span>{t('common.loading')}</span>
                </div>
            ) : rooms.length === 0 ? (
                <div className="cb-card p-8 text-center text-[--cb-text-tertiary]">
                    <div className="text-4xl mb-3">🏠</div>
                    <p>{t('sponsor.rooms_empty')}</p>
                </div>
            ) : (
                <div className="grid gap-5">
                    {rooms.map(room => {
                        const roomId  = String(room.room_id);
                        const isEditing = editingId === roomId;
                        const drops   = dropsCount(room);

                        return (
                            <div key={roomId} data-testid={`sponsor-room-card-${roomId}`} className="cb-card p-5 flex flex-col gap-4">
                                {/* ── Cabeçalho ── */}
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-bold text-lg text-[--cb-text-primary] font-display">
                                                {room.metadata?.name ?? `Sala #${roomId}`}
                                            </span>
                                            <span className="text-xs font-mono text-[--cb-text-tertiary]">#{roomId}</span>
                                            <span className="text-sm" data-testid={`sponsor-room-badge-${roomId}`}>{STATUS_EMOJI[room.status] ?? '⚫'} {room.status}</span>
                                            {hasNftDrop(room) && (
                                                <span className="cb-badge text-xs" style={{ background: 'rgb(147 51 234 / 0.12)', color: 'rgb(167 139 250)', border: '1px solid rgb(147 51 234 / 0.3)' }}>
                                                    🎁 NFT Drop
                                                </span>
                                            )}
                                            {hasTokenDrop(room) && (
                                                <span className="cb-badge text-xs" style={{ background: 'rgb(234 179 8 / 0.12)', color: 'rgb(253 224 71)', border: '1px solid rgb(234 179 8 / 0.3)' }}>
                                                    💰 Token Drop
                                                </span>
                                            )}
                                        </div>
                                        {room.metadata?.description && (
                                            <p className="text-sm text-[--cb-text-tertiary] mt-1 line-clamp-2">
                                                {room.metadata.description}
                                            </p>
                                        )}
                                    </div>
                                    <div className="flex gap-2 shrink-0">
                                        <button
                                            className="cb-btn cb-btn-outline cb-btn-sm"
                                            onClick={() => navigate(`/room/${roomId}/history`)}
                                        >
                                            📋 {t('replay.room_history_title')}
                                        </button>
                                        <button
                                            className={`cb-btn cb-btn-sm ${isEditing ? 'cb-btn-ghost' : 'cb-btn-primary'}`}
                                            data-testid={`sponsor-room-edit-${roomId}`}
                                            onClick={() => isEditing ? setEditingId(null) : startEdit(room)}
                                        >
                                            {isEditing ? t('common.cancel') : t('sponsor.btn_edit')}
                                        </button>
                                    </div>
                                </div>

                                {/* ── Stats grid ── */}
                                {!isEditing && (
                                    <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                                        <div className="bg-[--cb-bg-surface] p-3 rounded-lg">
                                            <dt className="text-[--cb-text-tertiary] text-xs mb-0.5">{t('game.ticket_price')}</dt>
                                            <dd className="font-mono font-medium text-[--cb-text-primary]">
                                                {fmtQty(room.ticket_price_default?.quantity ?? room.ticket_price_min?.quantity)}
                                            </dd>
                                        </div>
                                        <div className="bg-[--cb-bg-surface] p-3 rounded-lg">
                                            <dt className="text-[--cb-text-tertiary] text-xs mb-0.5">{t('sponsor.col_chat')}</dt>
                                            <dd>{room.metadata?.chat_enabled ? '✅' : '—'}</dd>
                                        </div>
                                        <div className="bg-[--cb-bg-surface] p-3 rounded-lg">
                                            <dt className="text-[--cb-text-tertiary] text-xs mb-0.5">{t('sponsor.col_delay')}</dt>
                                            <dd className="font-mono">{room.metadata?.auto_start_delay_sec ?? 30}s</dd>
                                        </div>
                                        <div className="bg-[--cb-bg-surface] p-3 rounded-lg">
                                            <dt className="text-[--cb-text-tertiary] text-xs mb-0.5">{t('sponsor.col_drops')}</dt>
                                            <dd className="font-mono">{drops > 0 ? `${drops} drop${drops !== 1 ? 's' : ''}` : '—'}</dd>
                                        </div>
                                    </dl>
                                )}

                                {/* ── Form de edição inline ── */}
                                {isEditing && (
                                    <div className="border-t border-[--cb-border-subtle] pt-4 grid gap-3" style={{ maxWidth: '32rem' }}>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs text-[--cb-text-tertiary]">{t('sponsor.field_name')}</span>
                                            <input
                                                className="cb-input"
                                                data-testid="sponsor-room-field-name"
                                                value={editForm.name}
                                                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                                                placeholder={`Sala #${roomId}`}
                                            />
                                        </label>
                                        <label className="flex flex-col gap-1">
                                            <span className="text-xs text-[--cb-text-tertiary]">{t('sponsor.field_description')}</span>
                                            <textarea
                                                className="cb-input"
                                                data-testid="sponsor-room-field-description"
                                                rows={2}
                                                value={editForm.description}
                                                onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                                                style={{ resize: 'vertical' }}
                                            />
                                        </label>
                                        <div className="grid grid-cols-2 gap-3">
                                            <label className="flex flex-col gap-1">
                                                <span className="text-xs text-[--cb-text-tertiary]">{t('sponsor.field_delay')}</span>
                                                <input
                                                    className="cb-input"
                                                    data-testid="sponsor-room-field-auto_start_delay"
                                                    type="number"
                                                    min={0}
                                                    max={300}
                                                    value={editForm.auto_start_delay_sec}
                                                    onChange={e => setEditForm(f => ({ ...f, auto_start_delay_sec: parseInt(e.target.value) || 0 }))}
                                                />
                                            </label>
                                            <label className="flex items-center gap-2 mt-5">
                                                <input
                                                    type="checkbox"
                                                    data-testid="sponsor-room-field-chat_enabled"
                                                    checked={editForm.chat_enabled}
                                                    onChange={e => setEditForm(f => ({ ...f, chat_enabled: e.target.checked }))}
                                                    style={{ width: '1rem', height: '1rem' }}
                                                />
                                                <span className="text-sm text-[--cb-text-primary]">{t('sponsor.field_chat')}</span>
                                            </label>
                                        </div>
                                        <div className="flex gap-2">
                                            <button
                                                className="cb-btn cb-btn-primary cb-btn-sm"
                                                data-testid="sponsor-room-save"
                                                disabled={saving}
                                                onClick={() => saveEdit(roomId)}
                                            >
                                                {saving ? t('common.saving') : t('common.save')}
                                            </button>
                                            <button
                                                className="cb-btn cb-btn-ghost cb-btn-sm"
                                                onClick={() => setEditingId(null)}
                                            >
                                                {t('common.cancel')}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
