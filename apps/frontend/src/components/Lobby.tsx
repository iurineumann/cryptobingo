// apps/frontend/src/components/Lobby.tsx
// Lobby centrado em salas — card por sala com prize pool em destaque,
// contagem de tickets do jogador, countdown animado e indicador ao vivo.
//
// Design: classes lobby-* definidas em globals.design.css
// Ref: ADR-007, ADR-010, SPEC.md §1.1–1.2

import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { useTranslation }                from 'react-i18next';
import { useNavigate }                   from 'react-router-dom';
import { Name, Session }                 from '@wharfkit/session';
import { UInt64 }                        from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainBalance } from '@cryptobingo/shared-types';
import { fetchRooms, type EnrichedRoom } from '../services/api';
import BuyTicketModal                    from './BuyTicketModal';
import RoomHistoryPanel                  from './RoomHistoryPanel';

interface LobbyProps {
    session:       Session;
    onEnterRoom?:  (roomId: string, gameId: string) => void;
    onReplayGame?: (gameId: string) => void;
}

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
const AUTO_LOCK_SEC        = 60;
const REVEAL_INTERVAL_MS   = 3000;
const SLOW_REVEAL_WINDOW   = AUTO_LOCK_SEC * 1000 + 75 * REVEAL_INTERVAL_MS;
const POLL_NORMAL_MS       = 8_000;   // salas idle
const POLL_ACTIVE_MS       = 2_000;   // quando há funding ou drawing

const STATUS_EMOJI: Record<string, string> = {
    created: '🕐', funding: '🟢', locked: '🔒',
    drawing: '🎲', drawn: '✅', archived: '📁', aborted: '❌',
};

function fmtCountdown(ms: number): string {
    if (ms <= 0) return '0s';
    const s = Math.ceil(ms / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

function splitAmount(quantity: string): { amount: string; symbol: string } {
    const parts = quantity.trim().split(' ');
    return { amount: parts[0] ?? '0', symbol: parts.slice(1).join(' ') };
}

export default function Lobby({ session, onEnterRoom, onReplayGame }: LobbyProps) {
    const { t }  = useTranslation();
    const navigate = useNavigate();

    const [balances,         setBalances]         = useState<BlockchainBalance[]>([]);
    const [games,            setGames]            = useState<BlockchainGameState[]>([]);
    const [activeRooms,      setActiveRooms]      = useState<EnrichedRoom[]>([]);
    // roomId → número de tickets do jogador naquela sala (funding only)
    const [myTickets,        setMyTickets]        = useState<Map<string, number>>(new Map());
    // roomIds onde o jogador participou (para mostrar botão Histórico)
    const [playerRoomIds,    setPlayerRoomIds]    = useState<Set<string>>(new Set());
    // gametypeId → { base_multiplier, max_win_weight } para cálculo do prêmio máximo por cartela
    const [gametypeMap,      setGametypeMap]      = useState<Map<string, { base_multiplier: number; max_win_weight: number }>>(new Map());
    const [loading,          setLoading]          = useState(false);
    const [selectedGame,     setSelectedGame]     = useState<BlockchainGameState | null>(null);
    const [historyRoomId,    setHistoryRoomId]    = useState<string | null>(null);
    const [now,              setNow]              = useState(Date.now());

    // ── Tick 1s para countdowns ───────────────────────────────────────────────
    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1_000);
        return () => clearInterval(id);
    }, []);

    // ── Carrega dados do blockchain ───────────────────────────────────────────
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const actorScope = Name.from(session.actor).value.toString();

            const [balRes, gamesRes, roomsData, gametypesRes] = await Promise.all([
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT, scope: actorScope,
                    table: 'balances', limit: 20, json: true,
                }),
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT, scope: CONTRACT,
                    table: 'games', limit: 50, reverse: true, json: true,
                }),
                fetchRooms().catch(() => ({ rooms: [] as EnrichedRoom[] })),
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT, scope: CONTRACT,
                    table: 'gametypes', limit: 50, json: true,
                }).catch(() => ({ rows: [] })),
            ]);

            const loadedGames = gamesRes.rows as BlockchainGameState[];
            setBalances(balRes.rows as BlockchainBalance[]);
            setGames(loadedGames);
            setActiveRooms(roomsData.rooms.filter(r => r.status === 'active'));

            // Constrói mapa de gametypes para cálculo de prêmio máximo por cartela
            const gtMap = new Map<string, { base_multiplier: number; max_win_weight: number }>();
            for (const gt of gametypesRes.rows as Array<any>) {
                const rules: Array<{ weight: number }> = gt.rules ?? [];
                const max_win_weight = rules.length > 0 ? Math.max(...rules.map(r => r.weight)) : 0;
                gtMap.set(String(gt.gametype_id), {
                    base_multiplier: Number(gt.base_multiplier) || 1,
                    max_win_weight,
                });
            }
            setGametypeMap(gtMap);

            // ── Tickets do jogador nas salas em funding ──────────────────────
            const fundingGames = loadedGames.filter(g =>
                g.status === 'funding' && g.room_id && g.room_id !== '0'
            );
            if (fundingGames.length > 0) {
                const results = await Promise.allSettled(
                    fundingGames.map(g =>
                        session.client.v1.chain.get_table_rows({
                            code: CONTRACT, scope: UInt64.from(g.game_id),
                            table: 'tickets', limit: 200,
                            lower_bound: Name.from(session.actor).value,
                            upper_bound: Name.from(session.actor).value,
                            index_position: 'secondary', key_type: 'i64', json: true,
                        })
                    )
                );
                const ticketMap = new Map<string, number>();
                results.forEach((r, i) => {
                    if (r.status === 'fulfilled') {
                        ticketMap.set(String(fundingGames[i].room_id), r.value.rows.length);
                    }
                });
                setMyTickets(ticketMap);
            }

            // ── Salas onde o jogador já participou (histórico) ───────────────
            const replayCandidates = loadedGames.filter(g =>
                ['archived', 'drawn'].includes(g.status) &&
                g.room_id && g.room_id !== '0'
            );
            if (replayCandidates.length > 0) {
                const results = await Promise.allSettled(
                    replayCandidates.map(g =>
                        session.client.v1.chain.get_table_rows({
                            code: CONTRACT, scope: UInt64.from(g.game_id),
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
            console.error('[Lobby]', err);
        } finally {
            setLoading(false);
        }
    }, [session]);

    // ── Smart polling: rápido quando há jogo ativo ────────────────────────────
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const hasActiveGame = useMemo(() =>
        games.some(g => ['funding', 'drawing', 'locked', 'drawn'].includes(g.status)),
        [games]
    );

    useEffect(() => {
        loadData();
    }, [loadData]);

    useEffect(() => {
        if (pollRef.current) clearInterval(pollRef.current);
        const interval = hasActiveGame ? POLL_ACTIVE_MS : POLL_NORMAL_MS;
        pollRef.current = setInterval(loadData, interval);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [loadData, hasActiveGame]);

    const handlePurchaseSuccess = useCallback(() => {
        setTimeout(loadData, 1_500);
    }, [loadData]);

    // ── Helpers ───────────────────────────────────────────────────────────────

    function isWithinSlowReveal(gameId: string): boolean {
        return Date.now() - Number(gameId) < SLOW_REVEAL_WINDOW;
    }

    function resolveDisplayStatus(g: BlockchainGameState): string {
        if (g.status === 'drawn') return 'drawing';
        if (g.status === 'archived' && isWithinSlowReveal(g.game_id)) return 'drawing';
        return g.status;
    }

    // Jogo "relevante" para exibição de uma sala — exclui aborted e archived fora da janela
    function currentGameForRoom(room: EnrichedRoom): BlockchainGameState | undefined {
        return games.find(g => {
            if (String(g.room_id) !== String(room.room_id)) return false;
            if (g.status === 'aborted') return false;
            if (g.status === 'archived' && !isWithinSlowReveal(g.game_id)) return false;
            return true;
        });
    }

    // Apenas jogos em funding sem sala são exibidos como cards avulsos
    const orphanGames = games.filter(g =>
        (!g.room_id || String(g.room_id) === '0') && g.status === 'funding'
    );
    const isEmpty = activeRooms.length === 0 && orphanGames.length === 0;

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <section className="page-lobby" aria-label="Lobby de Jogos">

            {/* ── Header ── */}
            <div className="lobby-header">
                <div className="lobby-header-left">
                    <h2 className="lobby-header-title">🎮 {t('lobby.title')}</h2>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
                    {/* Saldo */}
                    {balances.length > 0 && (
                        <div className="lobby-wallet-chip" aria-label={t('lobby.balance_aria')}>
                            <span className="symbol" aria-hidden="true">◆</span>
                            {balances.map((b, i) => (
                                <span key={i} style={i > 0 ? { borderLeft: '1px solid var(--cb-border-subtle)', paddingLeft: '0.5rem', marginLeft: '0.25rem' } : {}}>
                                    {b.balance.quantity}
                                </span>
                            ))}
                        </div>
                    )}
                    {/* Refresh */}
                    <button
                        className="cb-btn cb-btn-ghost cb-btn-sm"
                        style={{ width: '2.25rem', height: '2.25rem', padding: 0, borderRadius: '0.5rem' }}
                        onClick={loadData}
                        disabled={loading}
                        aria-label={t('lobby.refresh_aria')}
                        title={t('common.refresh')}
                    >
                        {loading
                            ? <span className="cb-spinner" style={{ width: '1rem', height: '1rem' }} />
                            : <span aria-hidden="true">↻</span>
                        }
                    </button>
                </div>
            </div>

            {/* ── Empty state ── */}
            {isEmpty ? (
                <div className="lobby-empty">
                    {loading ? (
                        <>
                            <span className="cb-spinner" style={{ width: '2.5rem', height: '2.5rem', borderWidth: '3px' }} />
                            <span className="lobby-empty-sub">{t('lobby.loading_rooms')}</span>
                        </>
                    ) : (
                        <>
                            <span className="lobby-empty-icon" aria-hidden="true">🎱</span>
                            <span className="lobby-empty-title">{t('lobby.no_active_rooms')}</span>
                            <span className="lobby-empty-sub">{t('lobby.check_back')}</span>
                            <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={loadData} style={{ marginTop: '0.5rem' }}>
                                ↻ {t('lobby.refresh')}
                            </button>
                        </>
                    )}
                </div>
            ) : (

                <div className="lobby-grid">

                    {/* ── Cards de salas ativas ── */}
                    {activeRooms.map(room => {
                        const currentGame   = currentGameForRoom(room);
                        const displayStatus = currentGame ? resolveDisplayStatus(currentGame) : 'idle';

                        const isFunding = displayStatus === 'funding';
                        const isDrawing = displayStatus === 'drawing';
                        const isIdle    = !currentGame;
                        const canBuy    = isFunding && !!onEnterRoom;
                        const canWatch  = isDrawing && !!onEnterRoom;
                        const myCount   = myTickets.get(String(room.room_id)) ?? 0;
                        const hasMyTickets = myCount > 0;
                        const hasNftDrop   = room.metadata?.drops?.some(d => d.template_id != null) ?? false;
                        const hasTokenDrop = room.metadata?.drops?.some(d => d.amount != null)       ?? false;

                        // Cartelas vendidas na partida atual (total_wagered / ticket_price)
                        const ticketsSold = (() => {
                            if (!currentGame) return null;
                            const pool  = parseFloat(currentGame.total_wagered?.quantity?.split(' ')[0] ?? '0');
                            const price = parseFloat(currentGame.ticket_price?.quantity?.split(' ')[0] ?? '0');
                            return pool > 0 && price > 0 ? Math.round(pool / price) : null;
                        })();

                        const lastGameId = currentGame?.game_id
                            ?? (String(room.current_game_id) !== '0' ? String(room.current_game_id) : null);
                        const navGameId  = lastGameId ?? '';

                        const roomName = room.metadata?.name ?? `${t('lobby.room_label')} #${room.room_id}`;

                        // Preço: mostra faixa min–max da sala se disponível
                        const priceDisplay = (() => {
                            const min = room.ticket_price_min?.quantity;
                            const max = room.ticket_price_max?.quantity;
                            const def = room.ticket_price_default?.quantity ?? currentGame?.ticket_price?.quantity;
                            if (min && max) {
                                const minAmt = splitAmount(min).amount;
                                const maxAmt = splitAmount(max).amount;
                                const sym    = splitAmount(min).symbol;
                                if (minAmt === maxAmt) return def ?? `${minAmt} ${sym}`;
                                return `${minAmt}–${maxAmt} ${sym}`;
                            }
                            return def ?? '—';
                        })();

                        // Countdown
                        const closeAt   = currentGame ? Number(currentGame.game_id) + AUTO_LOCK_SEC * 1000 : 0;
                        const remaining = closeAt - now;
                        const isUrgent  = remaining > 0 && remaining < 15_000;

                        // Status label
                        const statusLabel = currentGame
                            ? `${STATUS_EMOJI[displayStatus] ?? ''}${t(`lobby.${displayStatus}` as any, displayStatus)}`
                            : `🕐 ${t('lobby.room_waiting')}`;

                        // Prêmio máximo por cartela (fixed-odds, ADR-005)
                        // payout = ticket_price × base_multiplier × max_win_weight / 100
                        const gtInfo = gametypeMap.get(String(room.gametype_id));
                        const maxPrizeVal = (() => {
                            if (!gtInfo || gtInfo.max_win_weight === 0) return 0;
                            const defQty = room.ticket_price_default?.quantity;
                            if (!defQty) return 0;
                            const priceAmt = parseFloat(splitAmount(defQty).amount) || 0;
                            return priceAmt * gtInfo.base_multiplier * gtInfo.max_win_weight / 100;
                        })();
                        const priceSymbol = splitAmount(room.ticket_price_default?.quantity ?? '').symbol;
                        const hasSponsor  = (currentGame?.sponsor_pool?.length ?? 0) > 0;

                        // Card class
                        const cardClass = [
                            'lobby-card',
                            isFunding ? 'is-funding' : '',
                            isDrawing ? 'is-drawing' : '',
                            isIdle    ? 'is-idle'    : '',
                            hasMyTickets ? 'is-watching' : '',
                        ].filter(Boolean).join(' ');

                        return (
                            <article
                                key={`r-${room.room_id}`}
                                data-testid={`lobby-card-${room.room_id}`}
                                className={cardClass}
                                style={{ cursor: onEnterRoom && navGameId ? 'pointer' : 'default' }}
                                onClick={e => {
                                    if (onEnterRoom && navGameId && !(e.target as HTMLElement).closest('button')) {
                                        onEnterRoom(room.room_id, navGameId);
                                    }
                                }}
                                aria-label={`${roomName}, ${statusLabel}`}
                            >
                                {/* ── Head: nome + status ── */}
                                <div className="lobby-card-head">
                                    <div>
                                        <span className="lobby-card-id">Sala #{room.room_id}</span>
                                        {room.metadata?.name && <p className="lobby-card-name">{roomName}</p>}
                                    </div>
                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.3rem' }}>
                                        {isDrawing ? (
                                            <span className="lobby-card-live" data-testid={`lobby-status-${room.room_id}`}>AO VIVO</span>
                                        ) : (
                                            <span className={`cb-badge ${isFunding ? 'cb-badge-success' : isIdle ? 'cb-badge-neutral' : 'cb-badge-neutral'}`} data-testid={`lobby-status-${room.room_id}`}>
                                                {statusLabel}
                                            </span>
                                        )}
                                        {hasMyTickets && (
                                            <span className="lobby-card-mine">
                                                🎫 {t('lobby.my_tickets', { count: myCount })}
                                            </span>
                                        )}
                                        {hasNftDrop && (
                                            <span className="cb-badge text-xs" style={{ background: 'rgb(147 51 234 / 0.12)', color: 'rgb(167 139 250)', border: '1px solid rgb(147 51 234 / 0.3)' }}>
                                                🎁 {t('lobby.drop_nft')}
                                            </span>
                                        )}
                                        {hasTokenDrop && (
                                            <span className="cb-badge text-xs" style={{ background: 'rgb(234 179 8 / 0.12)', color: 'rgb(253 224 71)', border: '1px solid rgb(234 179 8 / 0.3)' }}>
                                                💰 {t('lobby.drop_token')}
                                            </span>
                                        )}
                                    </div>
                                </div>

                                {/* ── Stats grid ── */}
                                <dl className="lobby-card-stats">
                                    <div>
                                        <dt>{t('lobby.price')}</dt>
                                        <dd className="font-mono" style={{ fontSize: '0.8rem' }}>{priceDisplay}</dd>
                                    </div>
                                    <div>
                                        <dt>{t('lobby.max_prize_label')}</dt>
                                        <dd className={maxPrizeVal > 0 ? 'prize' : ''}>
                                            {maxPrizeVal > 0 ? maxPrizeVal.toFixed(4) : '—'}
                                            {maxPrizeVal > 0 && <span className="unit"> {priceSymbol}{hasSponsor ? ' ✨' : ''}</span>}
                                        </dd>
                                    </div>
                                    <div>
                                        <dt>{t('lobby.buy_tickets')}</dt>
                                        <dd style={{ color: hasMyTickets ? 'var(--cb-brand)' : undefined }}>
                                            {hasMyTickets ? myCount : '—'}
                                        </dd>
                                    </div>
                                    {ticketsSold != null && ticketsSold > 0 && (
                                        <div>
                                            <dt>🎫 {t('replay.col_tickets_sold')}</dt>
                                            <dd>{ticketsSold}</dd>
                                        </div>
                                    )}
                                </dl>

                                {/* ── Countdown / status info ── */}
                                {isFunding && remaining > 0 && (
                                    <span className={`lobby-card-ticker${isUrgent ? ' is-urgent' : ''}`} data-testid={`lobby-ticker-${room.room_id}`}>
                                        ⏱ {t('lobby.closes_in', { time: fmtCountdown(remaining) })}
                                    </span>
                                )}
                                {isFunding && remaining <= 0 && (
                                    <span className="lobby-card-ticker is-urgent" data-testid={`lobby-ticker-${room.room_id}`}>
                                        🔒 {t('lobby.starts_soon')}
                                    </span>
                                )}
                                {isIdle && (
                                    <span className="lobby-card-scheduled">
                                        ⏳ {t('lobby.next_game_soon')}
                                    </span>
                                )}

                                {/* ── Actions ── */}
                                <div className="lobby-card-actions">
                                    <div className="lobby-card-actions-row">
                                        {canBuy && (
                                            <button
                                                className="cb-btn cb-btn-primary flex-1"
                                                data-testid={`lobby-buy-${room.room_id}`}
                                                onClick={() => onEnterRoom!(room.room_id, currentGame!.game_id)}
                                                aria-label={t('lobby.buy_aria', { id: room.room_id })}
                                            >
                                                🎲 {t('lobby.buy_tickets')}
                                            </button>
                                        )}
                                        {canWatch && (
                                            <button
                                                className="cb-btn cb-btn-outline flex-1"
                                                data-testid={`lobby-watch-${room.room_id}`}
                                                onClick={() => onEnterRoom!(room.room_id, currentGame!.game_id)}
                                                aria-label={t('lobby.watch_aria', { id: room.room_id })}
                                            >
                                                👁 {t('lobby.watch_live')}
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
                                        {!canBuy && !canWatch && !navGameId && !isIdle && (
                                            <span style={{ flex: 1, display: 'flex', alignItems: 'center', fontSize: '0.78rem', color: 'var(--cb-text-tertiary)', gap: '0.4rem' }}>
                                                ⏳ {t('lobby.no_game_yet')}
                                            </span>
                                        )}
                                    </div>

                                    <button
                                        className="cb-btn cb-btn-ghost cb-btn-sm"
                                        data-testid={`lobby-history-${room.room_id}`}
                                        style={{ justifyContent: 'flex-start', gap: '0.4rem', fontSize: '0.75rem' }}
                                        onClick={e => { e.stopPropagation(); navigate(`/room/${room.room_id}/history`); }}
                                        aria-label={t('lobby.replay_aria', { id: room.room_id })}
                                    >
                                        📋 {t('lobby.history')}
                                        {playerRoomIds.has(String(room.room_id)) && (
                                            <span style={{ fontSize: '0.65rem', color: 'var(--cb-brand)', marginLeft: '0.2rem' }}>★</span>
                                        )}
                                    </button>
                                </div>
                            </article>
                        );
                    })}

                    {/* ── Jogos sem sala / legados (fallback) ── */}
                    {orphanGames.map(game => {
                        const isFunding = game.status === 'funding';
                        const tpSplit = splitAmount(game.ticket_price.quantity);
                        const orphanGt = gametypeMap.get(String(game.gametype_id));
                        const orphanMax = orphanGt && orphanGt.max_win_weight > 0
                            ? (parseFloat(tpSplit.amount) || 0) * orphanGt.base_multiplier * orphanGt.max_win_weight / 100
                            : 0;
                        return (
                            <article
                                key={game.game_id}
                                className={`lobby-card${isFunding ? ' is-funding' : ''}`}
                                aria-label={`${t('lobby.room_label')} #${game.game_id}`}
                            >
                                <div className="lobby-card-head">
                                    <div>
                                        <span className="lobby-card-id">#{game.game_id}</span>
                                        <p className="lobby-card-name">{t('lobby.room_label')}</p>
                                    </div>
                                    <span className={`cb-badge ${isFunding ? 'cb-badge-success' : 'cb-badge-neutral'}`}>
                                        {STATUS_EMOJI[game.status]}{t(`lobby.${game.status}` as any, game.status)}
                                    </span>
                                </div>

                                <dl className="lobby-card-stats">
                                    <div>
                                        <dt>{t('lobby.price')}</dt>
                                        <dd>{tpSplit.amount}<span className="unit">{tpSplit.symbol}</span></dd>
                                    </div>
                                    <div>
                                        <dt>{t('lobby.max_prize_label')}</dt>
                                        <dd className={orphanMax > 0 ? 'prize' : ''}>
                                            {orphanMax > 0 ? orphanMax.toFixed(4) : '—'}
                                            {orphanMax > 0 && <span className="unit"> {tpSplit.symbol}</span>}
                                        </dd>
                                    </div>
                                </dl>

                                {isFunding && (
                                    <div className="lobby-card-actions">
                                        <button
                                            className="cb-btn cb-btn-primary w-full"
                                            onClick={() => setSelectedGame(game)}
                                        >
                                            🎲 {t('lobby.buy_tickets')}
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

            {/* ── Modal de histórico da sala ── */}
            {historyRoomId && (
                <div
                    className="cb-overlay"
                    onClick={() => setHistoryRoomId(null)}
                    role="dialog"
                    aria-modal="true"
                    aria-label={`Histórico da sala #${historyRoomId}`}
                >
                    <div
                        className="cb-modal"
                        style={{ maxWidth: '44rem', maxHeight: '85dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="cb-modal-header">
                            <span className="cb-modal-title">📽 {t('replay.room_history_title')} #{historyRoomId}</span>
                            <button className="cb-modal-close" onClick={() => setHistoryRoomId(null)} aria-label={t('common.close')}>✕</button>
                        </div>
                        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
                            <RoomHistoryPanel
                                roomId={historyRoomId}
                                session={session}
                                onViewReplay={gameId => { setHistoryRoomId(null); onReplayGame?.(gameId); }}
                                onBack={() => setHistoryRoomId(null)}
                            />
                        </div>
                    </div>
                </div>
            )}
        </section>
    );
}
