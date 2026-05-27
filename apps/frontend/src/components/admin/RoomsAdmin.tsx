import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { EnrichedRoom, RoomDropConfig } from '../../services/api';
import {
    fetchRooms, createAdminRoom, updateRoomMetadata,
    activateRoom, pauseRoom, closeRoom,
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
    weight: number;
    max_tickets_per_player: number;
    name: string;
    description: string;
    drops: DropForm[];
    auto_start_delay_sec: number;
    chat_enabled: boolean;
}

const defaultForm: CreateForm = {
    room_id: 0, sponsor: '', gametype_id: 0,
    currency_quantity: '0.0000 BINGO', currency_contract: 'bingo.token',
    ticket_price_min_quantity: '0.0000 BINGO', ticket_price_min_contract: 'bingo.token',
    ticket_price_max_quantity: '0.0000 BINGO', ticket_price_max_contract: 'bingo.token',
    ticket_price_default_quantity: '0.0000 BINGO', ticket_price_default_contract: 'bingo.token',
    weight: 100, max_tickets_per_player: 0,
    name: '', description: '',
    drops: [], auto_start_delay_sec: 30, chat_enabled: true,
};

export default function RoomsAdmin() {
    const { t } = useTranslation();
    const [rooms,        setRooms]        = useState<EnrichedRoom[]>([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState<string | null>(null);
    const [success,      setSuccess]      = useState<string | null>(null);
    const [showCreate,   setShowCreate]   = useState(false);
    const [form,         setForm]         = useState<CreateForm>(defaultForm);
    const [submitting,   setSubmitting]   = useState(false);

    const loadRooms = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await fetchRooms();
            setRooms(res.rooms);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao carregar salas');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadRooms(); }, [loadRooms]);

    useEffect(() => {
        if (success) { const t = setTimeout(() => setSuccess(null), 3000); return () => clearTimeout(t); }
    }, [success]);

    useEffect(() => {
        if (error) { const t = setTimeout(() => setError(null), 3000); return () => clearTimeout(t); }
    }, [error]);

    const handleCreate = async () => {
        if (form.room_id === 0) { setError('room_id é obrigatório'); return; }
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
                weight: form.weight || 100,
                max_tickets_per_player: form.max_tickets_per_player || 0,
                name: form.name || undefined,
                description: form.description || undefined,
                auto_start_delay_sec: form.auto_start_delay_sec || 30,
                chat_enabled: form.chat_enabled,
                drops: form.drops.length > 0 ? form.drops as RoomDropConfig[] : undefined,
            });
            setSuccess(`Sala ${form.room_id} criada!`);
            setShowCreate(false);
            setForm(defaultForm);
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao criar sala');
        } finally {
            setSubmitting(false);
        }
    };

    const handleActivate = async (roomId: string) => {
        try {
            await activateRoom(roomId);
            setSuccess(`Sala ${roomId} ativada`);
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao ativar sala');
        }
    };

    const handlePause = async (roomId: string) => {
        try {
            await pauseRoom(roomId);
            setSuccess(`Sala ${roomId} pausada`);
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao pausar sala');
        }
    };

    const handleClose = async (roomId: string) => {
        try {
            await closeRoom(roomId);
            setSuccess(`Sala ${roomId} fechada`);
            await loadRooms();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Erro ao fechar sala');
        }
    };



    return (
        <section>
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-[--cb-text-primary]">Gerenciar Salas</h2>
                <button className="cb-btn cb-btn-primary cb-btn-sm" onClick={() => setShowCreate(s => !s)}>
                    {showCreate ? 'Cancelar' : 'Nova Sala'}
                </button>
            </div>

            {error && <div className="cb-alert cb-alert-error mb-3">{error}</div>}
            {success && <div className="cb-alert cb-alert-success mb-3">{success}</div>}

            {/* ── Create Form ── */}
            {showCreate && (
                <div className="cb-card mb-4 p-4 space-y-3">
                    <h3 className="font-bold text-sm">Nova Sala</h3>
                    <div className="grid grid-cols-2 gap-3">
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Room ID *
                            <input className="cb-input w-full mt-1" type="number" value={form.room_id || ''}
                                onChange={e => setForm(f => ({ ...f, room_id: parseInt(e.target.value) || 0 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Sponsor (vazio = sistema)
                            <input className="cb-input w-full mt-1" value={form.sponsor}
                                onChange={e => setForm(f => ({ ...f, sponsor: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            GameType ID
                            <input className="cb-input w-full mt-1" type="number" value={form.gametype_id || ''}
                                onChange={e => setForm(f => ({ ...f, gametype_id: parseInt(e.target.value) || 0 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Moeda (ex: 0.0000 BINGO)
                            <input className="cb-input w-full mt-1" value={form.currency_quantity}
                                onChange={e => setForm(f => ({ ...f, currency_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Contrato Moeda
                            <input className="cb-input w-full mt-1" value={form.currency_contract}
                                onChange={e => setForm(f => ({ ...f, currency_contract: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Preço Mínimo
                            <input className="cb-input w-full mt-1" value={form.ticket_price_min_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_min_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Preço Máximo
                            <input className="cb-input w-full mt-1" value={form.ticket_price_max_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_max_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Preço Padrão
                            <input className="cb-input w-full mt-1" value={form.ticket_price_default_quantity}
                                onChange={e => setForm(f => ({ ...f, ticket_price_default_quantity: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Weight (100 = 1.00x)
                            <input className="cb-input w-full mt-1" type="number" value={form.weight}
                                onChange={e => setForm(f => ({ ...f, weight: parseInt(e.target.value) || 100 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Max Tickets/Jogador (0 = sem limite)
                            <input className="cb-input w-full mt-1" type="number" value={form.max_tickets_per_player}
                                onChange={e => setForm(f => ({ ...f, max_tickets_per_player: parseInt(e.target.value) || 0 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Nome da Sala
                            <input className="cb-input w-full mt-1" value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Descrição
                            <input className="cb-input w-full mt-1" value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary]">
                            Delay Auto-Start (s)
                            <input className="cb-input w-full mt-1" type="number" value={form.auto_start_delay_sec}
                                onChange={e => setForm(f => ({ ...f, auto_start_delay_sec: parseInt(e.target.value) || 30 }))} />
                        </label>
                        <label className="text-xs text-[--cb-text-tertiary] flex items-center gap-2 mt-4">
                            <input type="checkbox" checked={form.chat_enabled}
                                onChange={e => setForm(f => ({ ...f, chat_enabled: e.target.checked }))} />
                            Chat Habilitado
                        </label>
                    </div>
                    <button className="cb-btn cb-btn-primary mt-2" onClick={handleCreate} disabled={submitting}>
                        {submitting ? 'Criando...' : 'Criar Sala'}
                    </button>
                </div>
            )}

            {/* ── Room List ── */}
            {loading ? (
                <div className="flex justify-center py-8"><span className="cb-spinner w-8 h-8" /></div>
            ) : rooms.length === 0 ? (
                <p className="text-sm text-[--cb-text-tertiary] py-8 text-center">Nenhuma sala encontrada.</p>
            ) : (
                <div className="space-y-3">
                    {rooms.map(room => (
                        <div key={room.room_id} className="cb-card p-4">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <h3 className="font-bold text-[--cb-text-primary]">
                                        {room.metadata?.name ?? `Sala #${room.room_id}`}
                                    </h3>
                                    <p className="text-xs text-[--cb-text-tertiary] mt-1">
                                        Room ID: {room.room_id} | Sponsor: {room.sponsor}
                                        {room.sponsor_room ? ' (Patrocinada)' : ''}
                                        {' | '}Status: {room.status}
                                        {room.current_game_id !== '0' && ` | Game: #${room.current_game_id}`}
                                    </p>
                                </div>
                                <div className="flex gap-2">
                                    {room.status === 'inactive' && (
                                        <button className="cb-btn cb-btn-primary cb-btn-xs" onClick={() => handleActivate(room.room_id)}>
                                            Ativar
                                        </button>
                                    )}
                                    {room.status === 'active' && (
                                        <button className="cb-btn cb-btn-outline cb-btn-xs" onClick={() => handlePause(room.room_id)}>
                                            Pausar
                                        </button>
                                    )}
                                    {(room.status === 'active' || room.status === 'paused') && (
                                        <button className="cb-btn cb-btn-ghost cb-btn-xs text-[--cb-danger]" onClick={() => handleClose(room.room_id)}>
                                            Fechar
                                        </button>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-4 gap-2 mt-2 text-xs text-[--cb-text-secondary]">
                                <span>Min: {room.ticket_price_min.quantity}</span>
                                <span>Max: {room.ticket_price_max.quantity}</span>
                                <span>Default: {room.ticket_price_default.quantity}</span>
                                <span>Weight: {(parseInt(room.weight) / 100).toFixed(2)}x</span>
                                <span>Max/jogador: {room.max_tickets_per_player || '∞'}</span>
                                <span>Delay: {room.metadata?.auto_start_delay_sec ?? 30}s</span>
                                <span>Chat: {room.metadata?.chat_enabled !== false ? '✅' : '❌'}</span>
                                <span>Drops: {room.metadata?.drops?.length ?? 0}</span>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </section>
    );
}
