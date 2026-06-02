// apps/frontend/src/components/Lobby.tsx
// Lobby centrado em salas: um card por sala ativa, com jogo atual e atalho de histórico.
// Ref: ADR-007, SPEC.md §1.1, §1.2, §4

import { useEffect, useState, useCallback, useRef } from 'react';
import { useTranslation }                   from 'react-i18next';
import { Name, Session }                    from '@wharfkit/session';
import { UInt64 }                           from '@wharfkit/antelope';
import type {
    BlockchainGameState,
    BlockchainBalance,
} from '@cryptobingo/shared-types';
import { fetchRooms, type EnrichedRoom }    from '../services/api';
import BuyTicketModal    from './BuyTicketModal';
import RoomHistoryPanel  from './RoomHistoryPanel';

interface LobbyProps {
    session:       Session;
    onEnterRoom?:  (roomId: string, gameId: string) => void;
    onReplayGame?: (gameId: string) => void;
}

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

const STATUS_CLASS: Record<string, string> = {
    created:  'cb-status-created',
    funding:  'cb-status-funding',
    locked:   'cb-status-locked',
    drawing:  'cb-status-drawing',
    drawn:    'cb-status-drawn',
    archived: 'cb-status-archived',
    aborted:  'cb-status-aborted',
};

const STATUS_EMOJI: Record<string, string> = {
    created: '🕐', funding: '🟢', locked: '🔒',
    drawing: '🎲', drawn: '✅', archived: '📁', aborted: '❌',
};

const STATUS_LABEL_KEY: Record<string, string> = {
    created: 'lobby.scheduled', funding: 'lobby.sales_open',
    locked: 'lobby.locked', drawing: 'lobby.drawing',
    drawn: 'lobby.drawn', archived: 'lobby.archived', aborted: 'lobby.aborted',
};

export default function Lobby({ session, onEnterRoom, onReplayGame }: LobbyProps) {

    const { t } = useTranslation();
    const [balances,          setBalances]          = useState<BlockchainBalance[]>([]);
    const [games,             setGames]             = useState<BlockchainGameState[]>([]);
    const [activeRooms,       setActiveRooms]       = useState<EnrichedRoom[]>([]);
    const [playerRoomIds,     setPlayerRoomIds]     = useState<Set<string>>(new Set());
    const [loadingData,       setLoadingData]       = useState(false);
    const [selectedGame,      setSelectedGame]      = useState<BlockchainGameState | null>(null);
    const [historyModalRoomId, setHistoryModalRoomId] = useState<string | null>(null);

    // ── Dados da blockchain ───────────────────────────────────────────────────

    const loadBlockchainData = useCallback(async () => {
        setLoadingData(true);
        try {
            const ownerScope = Name.from(session.actor).value.toString();

            const [balanceRes, gamesRes, roomsData] = await Promise.all([
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT, scope: ownerScope,
                    table: 'balances', limit: 20, json: true,
                }),
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT,
                    table: 'games', limit: 20, json: true,
                }),
                fetchRooms().catch(() => ({ rooms: [] as EnrichedRoom[] })),
            ]);

            const loadedGames = gamesRes.rows as BlockchainGameState[];
            setBalances(balanceRes.rows as BlockchainBalance[]);
            setGames(loadedGames);
            setActiveRooms(roomsData.rooms.filter(r => r.status === 'active'));

            // Verifica em quais salas o jogador participou (agrega por room_id)
            const replayCandidates = loadedGames.filter(g =>
                ['archived', 'drawn', 'aborted'].includes(g.status) &&
                g.room_id && g.room_id !== '0'
            );
            if (replayCandidates.length > 0) {
                const results = await Promise.allSettled(
                    replayCandidates.map(g =>
                        session.client.v1.chain.get_table_rows({
                            code: CONTRACT_ACCOUNT, scope: UInt64.from(g.game_id),
                            table: 'tickets', limit: 1,
                            lower_bound: Name.from(session.actor).value,
                            upper_bound: Name.from(session.actor).value,
                            index_position: 'secondary', key_type: 'i64', json: true,
                        })
                    )
                );
                const participated = new Set<string>();
                results.forEach((r, i) => {
                    if (r.status === 'fulfilled' && r.value.rows.length > 0) {
                        participated.add(String(replayCandidates[i].room_id));
                    }
                });
                setPlayerRoomIds(participated);
            }
        } catch (err) {
            console.error('[Lobby] Erro ao carregar dados:', err);
        } finally {
            setLoadingData(false);
        }
    }, [session]);

    useEffect(() => {
        loadBlockchainData();
        const interval = setInterval(loadBlockchainData, 15_000);
        return () => clearInterval(interval);
    }, [loadBlockchainData]);

    const handlePurchaseSuccess = () => setTimeout(loadBlockchainData, 2000);

    // ── Countdown tick (1s) ───────────────────────────────────────────────────
    const [, setTick] = useState(0);
    useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 1000);
        return () => clearInterval(id);
    }, []);

    const AUTO_LOCK_SEC = 60; // deve coincidir com AUTO_LOCK_DELAY_SEC do worker
    const REVEAL_INTERVAL_MS = 3000;
    const SLOW_REVEAL_WINDOW_MS = 75 * REVEAL_INTERVAL_MS;

    function isWithinSlowRevealWindow(gameId: string): boolean {
        const age = Date.now() - Number(gameId);
        return age < AUTO_LOCK_SEC * 1000 + SLOW_REVEAL_WINDOW_MS;
    }

    function slowRevealStatus(realStatus: string, gameId: string): string {
        if (realStatus === 'drawn') return 'drawing';
        if (realStatus === 'archived' && isWithinSlowRevealWindow(gameId)) return 'drawing';
        return realStatus;
    }

    function fmtCountdown(ms: number): string {
        if (ms <= 0) return '0s';
        const s = Math.ceil(ms / 1000);
        if (s < 60) return `${s}s`;
        return `${Math.floor(s / 60)}m${s % 60 > 0 ? ` ${s % 60}s` : ''}`;
    }

    // ── Render helpers ────────────────────────────────────────────────────────

    const renderBalances = () => {
        if (!balances.length)
            return <span className="text-[--cb-text-tertiary]">{t('lobby.no_balance')}</span>;
        return (
            <>
                {balances.map((b, i) => (
                    <span key={i} className={i > 0 ? 'ml-3' : ''}>{b.balance.quantity}</span>
                ))}
            </>
        );
    };

    // Jogos sem sala (fallback — normalmente não existem)
    const orphanGames = games.filter(g => !g.room_id || String(g.room_id) === '0');

    const isEmpty = activeRooms.length === 0 && orphanGames.length === 0;

    // ── JSX ───────────────────────────────────────────────────────────────────

    return (
        <section aria-label="Lobby de Jogos">

            {/* ── Header ── */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <h2 className="text-xl font-bold text-[--cb-text-primary] flex items-center gap-2">
                    <span aria-hidden="true">🎮</span> {t('lobby.title')}
                </h2>
                <div className="flex items-center gap-3 flex-wrap">
                    <div
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] font-mono text-sm font-semibold text-[--cb-text-primary]"
                        aria-label={t('lobby.balance_aria')}
                    >
                        <span className="text-[--cb-accent]" aria-hidden="true">💰</span>
                        {renderBalances()}
                    </div>
                    <button
                        className={[
                            'cb-btn cb-btn-ghost cb-btn-sm w-9 h-9 p-0 rounded-lg',
                            loadingData ? 'pointer-events-none' : '',
                        ].join(' ')}
                        onClick={loadBlockchainData}
                        disabled={loadingData}
                        aria-label={t('lobby.refresh_aria')}
                        title={t('common.refresh')}
                    >
                        <span className={loadingData ? 'cb-spinner w-4 h-4' : ''} aria-hidden="true">
                            {!loadingData && '🔄'}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Grid de salas ── */}
            {isEmpty ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[--cb-text-tertiary]">
                    {loadingData ? (
                        <>
                            <span className="cb-spinner w-10 h-10" style={{ width: '2.5rem', height: '2.5rem', borderWidth: '3px' }} />
                            <p className="text-sm">{t('lobby.loading_rooms')}</p>
                        </>
                    ) : (
                        <>
                            <span className="text-5xl" aria-hidden="true">🎱</span>
                            <p className="text-base font-medium">{t('lobby.no_active_rooms')}</p>
                            <p className="text-sm">{t('lobby.check_back')}</p>
                            <button className="cb-btn cb-btn-outline cb-btn-sm mt-2" onClick={loadBlockchainData}>
                                🔄 {t('lobby.refresh')}
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' }}>

                    {/* ── Cards de salas ativas ── */}
                    {activeRooms.map(room => {
                        // Jogo atual da sala — inclui archived se ainda dentro da janela de slow reveal
                        const currentGame = games.find(g => {
                            if (String(g.room_id) !== String(room.room_id)) return false;
                            if (g.status === 'aborted') return false;
                            if (g.status === 'archived' && !isWithinSlowRevealWindow(g.game_id)) return false;
                            return true;
                        });

                        const displayStatus = currentGame
                            ? slowRevealStatus(currentGame.status, currentGame.game_id)
                            : 'idle';

                        const canBuy    = currentGame?.status === 'funding';
                        const canWatch  = !!currentGame && ['drawing', 'locked', 'drawn'].includes(displayStatus);
                        const hasReplay = playerRoomIds.has(String(room.room_id));
                        // Sala sempre é entrável se ativa — mesmo sem jogo corrente
                        const canEnter  = !!onEnterRoom;

                        const statusCls = currentGame
                            ? (STATUS_CLASS[displayStatus] ?? 'cb-badge cb-badge-neutral')
                            : 'cb-status-created';
                        const statusLbl = currentGame
                            ? `${STATUS_EMOJI[displayStatus] ?? ''}${t(STATUS_LABEL_KEY[displayStatus] ?? displayStatus)}`
                            : `🕐 ${t('lobby.room_waiting')}`;

                        const roomName = room.metadata?.name;
                        const price    = currentGame?.ticket_price?.quantity
                                      ?? room.ticket_price_default?.quantity
                                      ?? '—';
                        // Jogo a navegar: ativo ou — se aguardando — o último jogo da sala
                        const lastGameId = currentGame?.game_id
                                        ?? (String(room.current_game_id) !== '0' ? String(room.current_game_id) : null);
                        const navGameId  = lastGameId ?? '';

                        return (
                            <article
                                key={`r-${room.room_id}`}
                                className={[
                                    'cb-card flex flex-col gap-3 transition-all duration-200',
                                    canEnter ? 'cursor-pointer' : '',
                                    'hover:border-[--cb-border-strong]',
                                ].join(' ')}
                                onClick={(e) => {
                                    if (canEnter && navGameId && !(e.target as HTMLElement).closest('button')) {
                                        onEnterRoom!(room.room_id, navGameId);
                                    }
                                }}
                                title={canEnter ? t('lobby.click_to_enter_room') : undefined}
                                aria-label={`${roomName ?? `${t('lobby.room_label')} #${room.room_id}`}, ${statusLbl}`}
                            >
                                <header className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-[--cb-text-primary] font-display">
                                        {roomName
                                            ? roomName
                                            : <>{t('lobby.room_label')} <span className="font-mono">#{room.room_id}</span></>
                                        }
                                    </h3>
                                    <span className={statusCls}>{statusLbl}</span>
                                </header>

                                <dl className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-[--cb-text-tertiary]">{t('lobby.price')}</dt>
                                        <dd className="font-mono font-medium text-[--cb-text-primary]">{price}</dd>
                                    </div>
                                    {currentGame && (
                                        <div className="flex justify-between">
                                            <dt className="text-[--cb-text-tertiary]">{t('lobby.prize')}</dt>
                                            <dd className="font-mono font-bold text-[--cb-success]">
                                                {currentGame.prize_pool.quantity}
                                            </dd>
                                        </div>
                                    )}
                                    {currentGame && currentGame.sponsor_pool?.length > 0 && (
                                        <div className="flex justify-between">
                                            <dt className="text-[--cb-text-tertiary]">{t('lobby.sponsorship')}</dt>
                                            <dd className="font-mono font-medium text-[--cb-brand]">
                                                {currentGame.sponsor_pool.map(s => s.quantity).join(' + ')}
                                            </dd>
                                        </div>
                                    )}
                                </dl>

                                {/* Timer de estado */}
                                {displayStatus === 'funding' && currentGame && (() => {
                                    const closeAt = Number(currentGame.game_id) + AUTO_LOCK_SEC * 1000;
                                    const remaining = closeAt - Date.now();
                                    return remaining > 0 ? (
                                        <p className="text-xs text-[--cb-text-tertiary] flex items-center gap-1">
                                            ⏱ {t('lobby.closes_in', { time: fmtCountdown(remaining) })}
                                        </p>
                                    ) : (
                                        <p className="text-xs text-[--cb-brand] flex items-center gap-1">
                                            🔒 {t('lobby.starts_soon')}
                                        </p>
                                    );
                                })()}
                                {(displayStatus === 'locked' || displayStatus === 'drawing') && (
                                    <p className="text-xs text-[--cb-brand] flex items-center gap-1">
                                        🎲 {t('lobby.drawing')}
                                    </p>
                                )}
                                {!currentGame && (
                                    <p className="text-xs text-[--cb-text-tertiary] flex items-center gap-1">
                                        ⏳ {t('lobby.no_game_yet')}
                                    </p>
                                )}

                                <div className="flex gap-2 mt-auto pt-1">
                                    {canBuy && (
                                        <button
                                            className="cb-btn cb-btn-primary flex-1"
                                            onClick={() => onEnterRoom!(room.room_id, currentGame!.game_id)}
                                            aria-label={t('lobby.buy_aria', { id: room.room_id })}
                                        >
                                            🎲 {t('lobby.buy')}
                                        </button>
                                    )}
                                    {canWatch && (
                                        <button
                                            className="cb-btn cb-btn-outline flex-1"
                                            onClick={() => onEnterRoom!(room.room_id, currentGame!.game_id)}
                                            aria-label={t('lobby.watch_aria', { id: room.room_id })}
                                        >
                                            👁 {t('lobby.watch')}
                                        </button>
                                    )}
                                    {!canBuy && !canWatch && navGameId && (
                                        <button
                                            className="cb-btn cb-btn-outline flex-1"
                                            onClick={() => onEnterRoom!(room.room_id, navGameId)}
                                            aria-label={t('lobby.enter_room_aria', { id: room.room_id })}
                                        >
                                            📊 {t('lobby.view_results')}
                                        </button>
                                    )}
                                    {!canBuy && !canWatch && !navGameId && (
                                        <span className="text-xs text-[--cb-text-tertiary] flex-1 flex items-center gap-1.5">
                                            ⏳ {t('lobby.no_game_yet')}
                                        </span>
                                    )}
                                    {hasReplay && (
                                        <button
                                            className="cb-btn cb-btn-ghost cb-btn-sm px-2"
                                            onClick={() => setHistoryModalRoomId(room.room_id)}
                                            title={t('lobby.replay')}
                                            aria-label={t('lobby.replay_aria', { id: room.room_id })}
                                        >
                                            📽
                                        </button>
                                    )}
                                </div>
                            </article>
                        );
                    })}

                    {/* ── Jogos sem sala (fallback) ── */}
                    {orphanGames.map(game => {
                        const canBuy   = game.status === 'funding';
                        const statusCls = STATUS_CLASS[game.status] ?? 'cb-badge cb-badge-neutral';
                        const statusLbl = `${STATUS_EMOJI[game.status] ?? ''}${t(STATUS_LABEL_KEY[game.status] ?? game.status)}`;
                        return (
                            <article
                                key={game.game_id}
                                className="cb-card flex flex-col gap-3 transition-all duration-200 hover:border-[--cb-border-strong]"
                                aria-label={t('lobby.room_aria', { id: game.game_id, status: statusLbl })}
                            >
                                <header className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-[--cb-text-primary] font-display">
                                        {t('lobby.room_label')} <span className="font-mono">#{game.game_id}</span>
                                    </h3>
                                    <span className={statusCls}>{statusLbl}</span>
                                </header>
                                <dl className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-[--cb-text-tertiary]">{t('lobby.price')}</dt>
                                        <dd className="font-mono font-medium text-[--cb-text-primary]">{game.ticket_price.quantity}</dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[--cb-text-tertiary]">{t('lobby.prize')}</dt>
                                        <dd className="font-mono font-bold text-[--cb-success]">{game.prize_pool.quantity}</dd>
                                    </div>
                                </dl>
                                {canBuy && (
                                    <div className="mt-auto pt-1">
                                        <button
                                            className="cb-btn cb-btn-primary w-full"
                                            onClick={() => setSelectedGame(game)}
                                            aria-label={t('lobby.buy_aria', { id: game.game_id })}
                                        >
                                            🎲 {t('lobby.buy')}
                                        </button>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            {/* ── Modal de compra (jogos sem sala) ── */}
            {selectedGame && (
                <BuyTicketModal
                    gameId={selectedGame.game_id}
                    ticketPrice={selectedGame.ticket_price}
                    session={session}
                    onClose={() => setSelectedGame(null)}
                    onSuccess={handlePurchaseSuccess}
                />
            )}

            {/* ── Modal de histórico de partidas da sala ── */}
            {historyModalRoomId && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
                    onClick={() => setHistoryModalRoomId(null)}
                >
                    <div
                        className="cb-card relative w-full max-w-2xl mx-4 flex flex-col"
                        style={{ maxHeight: '80vh' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <button
                            className="absolute top-3 right-3 cb-btn cb-btn-ghost cb-btn-sm"
                            onClick={() => setHistoryModalRoomId(null)}
                            aria-label={t('common.close')}
                        >
                            ✕
                        </button>
                        <div className="overflow-y-auto p-6">
                            <RoomHistoryPanel
                                roomId={historyModalRoomId}
                                session={session}
                                onViewReplay={(gameId) => {
                                    setHistoryModalRoomId(null);
                                    onReplayGame?.(gameId);
                                }}
                                onBack={() => setHistoryModalRoomId(null)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
