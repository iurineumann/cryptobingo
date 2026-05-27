// apps/frontend/src/components/Lobby.tsx
// Lista de salas + Slow Reveal integrado — migrado para Tailwind v4 + Design System cb-*.
// Ref: ADR-007, SPEC.md §1.1, §1.2, §4

import { useEffect, useState, useCallback } from 'react';
import { Name, Session }                    from '@wharfkit/session';
import type {
    BlockchainGameState,
    BlockchainBalance,
    BlockchainTicketRecord,
} from '@cryptobingo/shared-types';
import BuyTicketModal  from './BuyTicketModal';
import BallDisplay     from './BallDisplay';
import TicketGrid      from './TicketGrid';
import { useSlowReveal } from '../hooks/useSlowReveal';

interface LobbyProps { session: Session }

const CONTRACT_ACCOUNT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

// Mapeamento status → classe CSS do Design System
const STATUS_CLASS: Record<string, string> = {
    created:  'cb-status-created',
    funding:  'cb-status-funding',
    locked:   'cb-status-locked',
    drawing:  'cb-status-drawing',
    drawn:    'cb-status-drawn',
    archived: 'cb-status-archived',
    aborted:  'cb-status-aborted',
};

const STATUS_LABEL: Record<string, string> = {
    created:  '🕐 Agendado',
    funding:  '🟢 Vendas Abertas',
    locked:   '🔒 Encerrado',
    drawing:  '🎲 Sorteando',
    drawn:    '✅ Sorteado',
    archived: '📁 Arquivado',
    aborted:  '❌ Cancelado',
};

export default function Lobby({ session }: LobbyProps) {

    const [balances,      setBalances]      = useState<BlockchainBalance[]>([]);
    const [games,         setGames]         = useState<BlockchainGameState[]>([]);
    const [playerTickets, setPlayerTickets] = useState<BlockchainTicketRecord[]>([]);
    const [loadingData,   setLoadingData]   = useState(false);
    const [selectedGame,  setSelectedGame]  = useState<BlockchainGameState | null>(null);
    const [watchGameId,   setWatchGameId]   = useState<string | null>(null);

    const { drawnBalls, lastBall, isDrawing, winners, isAborted, abortReason, wsStatus } =
        useSlowReveal(watchGameId);

    const drawnNumbers = new Set(drawnBalls.map(b => b.number));
    const lastDrawnNumber = lastBall?.number;

    // ── Dados da blockchain ───────────────────────────────────────────────────

    const loadBlockchainData = useCallback(async () => {
        setLoadingData(true);
        try {
            const ownerScope = Name.from(session.actor).value.toString();

            const [balanceRes, gamesRes] = await Promise.all([
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT, scope: ownerScope,
                    table: 'balances', limit: 20, json: true,
                }),
                session.client.v1.chain.get_table_rows({
                    code: CONTRACT_ACCOUNT, scope: CONTRACT_ACCOUNT,
                    table: 'games', limit: 20, json: true,
                }),
            ]);

            setBalances(balanceRes.rows as BlockchainBalance[]);
            setGames(gamesRes.rows as BlockchainGameState[]);

            if (watchGameId) await loadPlayerTickets(watchGameId);
        } catch (err) {
            console.error('[Lobby] Erro ao carregar dados da blockchain:', err);
        } finally {
            setLoadingData(false);
        }
    }, [session, watchGameId]);

    const loadPlayerTickets = async (gameId: string) => {
        try {
            const res = await session.client.v1.chain.get_table_rows({
                code:           CONTRACT_ACCOUNT,
                scope:          gameId,
                table:          'tickets',
                lower_bound:    Name.from(session.actor).value,
                upper_bound:    Name.from(session.actor).value,
                index_position: 'secondary',
                key_type:       'i64',
                limit:          50,
                json:           true,
            });
            setPlayerTickets(res.rows as BlockchainTicketRecord[]);
        } catch (err) {
            console.error('[Lobby] Erro ao carregar cartelas:', err);
        }
    };

    useEffect(() => {
        loadBlockchainData();
        const interval = setInterval(loadBlockchainData, 15_000);
        return () => clearInterval(interval);
    }, [loadBlockchainData]);

    useEffect(() => {
        if (watchGameId) loadPlayerTickets(watchGameId);
        else setPlayerTickets([]);
    }, [watchGameId]);

    const handlePurchaseSuccess = () => setTimeout(loadBlockchainData, 2000);

    const watchedGame = games.find(g => g.game_id === watchGameId) ?? null;

    // ── Render helpers ────────────────────────────────────────────────────────

    const renderBalances = () => {
        if (!balances.length) {
            return <span className="text-[--cb-text-tertiary]">0.0000 BINGO</span>;
        }
        return (
            <>
                {balances.map((b, i) => (
                    <span key={i} className={i > 0 ? 'ml-3' : ''}>
                        {b.balance.quantity}
                    </span>
                ))}
            </>
        );
    };

    // ── JSX ───────────────────────────────────────────────────────────────────

    return (
        <section aria-label="Lobby de Jogos">

            {/* ── Header do Lobby ── */}
            <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
                <h2 className="text-xl font-bold text-[--cb-text-primary] flex items-center gap-2">
                    <span aria-hidden="true">🎮</span> Lobby de Jogos
                </h2>
                <div className="flex items-center gap-3 flex-wrap">

                    {/* Saldo */}
                    <div
                        className="flex items-center gap-2 px-4 py-2 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] font-mono text-sm font-semibold text-[--cb-text-primary]"
                        aria-label="Seu saldo"
                    >
                        <span className="text-[--cb-accent]" aria-hidden="true">💰</span>
                        {renderBalances()}
                    </div>

                    {/* Refresh */}
                    <button
                        className={[
                            'cb-btn cb-btn-ghost cb-btn-sm w-9 h-9 p-0 rounded-lg',
                            loadingData ? 'pointer-events-none' : '',
                        ].join(' ')}
                        onClick={loadBlockchainData}
                        disabled={loadingData}
                        aria-label="Atualizar dados"
                        title="Atualizar"
                    >
                        <span className={loadingData ? 'cb-spinner w-4 h-4' : ''} aria-hidden="true">
                            {!loadingData && '🔄'}
                        </span>
                    </button>
                </div>
            </div>

            {/* ── Grid de jogos ── */}
            {games.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-[--cb-text-tertiary]">
                    {loadingData ? (
                        <>
                            <span className="cb-spinner w-10 h-10" style={{ width: '2.5rem', height: '2.5rem', borderWidth: '3px' }} />
                            <p className="text-sm">Carregando salas…</p>
                        </>
                    ) : (
                        <>
                            <span className="text-5xl" aria-hidden="true">🎱</span>
                            <p className="text-base font-medium">Nenhuma sala ativa</p>
                            <p className="text-sm">Verifique novamente em instantes.</p>
                            <button className="cb-btn cb-btn-outline cb-btn-sm mt-2" onClick={loadBlockchainData}>
                                🔄 Atualizar
                            </button>
                        </>
                    )}
                </div>
            ) : (
                <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(17rem, 1fr))' }}>
                    {games.map(game => {
                        const canBuy    = game.status === 'funding';
                        const canWatch  = ['drawing', 'drawn', 'locked'].includes(game.status);
                        const isWatched = watchGameId === game.game_id;
                        const statusCls = STATUS_CLASS[game.status] ?? 'cb-badge cb-badge-neutral';
                        const statusLbl = STATUS_LABEL[game.status] ?? game.status;

                        return (
                            <article
                                key={game.game_id}
                                className={[
                                    'cb-card flex flex-col gap-3 transition-all duration-200',
                                    isWatched
                                        ? 'border-[--cb-brand] shadow-[var(--shadow-glow-brand)]'
                                        : 'hover:border-[--cb-border-strong]',
                                ].join(' ')}
                                aria-label={`Sala ${game.game_id}, status: ${statusLbl}`}
                            >
                                {/* Cabeçalho do card */}
                                <header className="flex items-start justify-between gap-2">
                                    <h3 className="font-bold text-[--cb-text-primary] font-display">
                                        Sala <span className="font-mono">#{game.game_id}</span>
                                    </h3>
                                    <span className={statusCls}>{statusLbl}</span>
                                </header>

                                {/* Informações financeiras */}
                                <dl className="space-y-1.5 text-sm">
                                    <div className="flex justify-between">
                                        <dt className="text-[--cb-text-tertiary]">Preço</dt>
                                        <dd className="font-mono font-medium text-[--cb-text-primary]">
                                            {game.ticket_price.quantity}
                                        </dd>
                                    </div>
                                    <div className="flex justify-between">
                                        <dt className="text-[--cb-text-tertiary]">Prêmio</dt>
                                        <dd className="font-mono font-bold text-[--cb-success]">
                                            {game.prize_pool.quantity}
                                        </dd>
                                    </div>
                                    {game.sponsor_pool.length > 0 && (
                                        <div className="flex justify-between">
                                            <dt className="text-[--cb-text-tertiary]">Patrocínio</dt>
                                            <dd className="font-mono font-medium text-[--cb-brand]">
                                                {game.sponsor_pool.map(s => s.quantity).join(' + ')}
                                            </dd>
                                        </div>
                                    )}
                                </dl>

                                {/* Ações */}
                                {(canBuy || canWatch) && (
                                    <div className="flex gap-2 mt-auto pt-1">
                                        {canBuy && (
                                            <button
                                                className="cb-btn cb-btn-primary flex-1"
                                                onClick={() => setSelectedGame(game)}
                                                aria-label={`Comprar cartelas para a sala ${game.game_id}`}
                                            >
                                                🎲 Comprar
                                            </button>
                                        )}
                                        {canWatch && (
                                            <button
                                                className={[
                                                    'cb-btn flex-1',
                                                    isWatched ? 'cb-btn-primary' : 'cb-btn-outline',
                                                ].join(' ')}
                                                onClick={() => setWatchGameId(isWatched ? null : game.game_id)}
                                                aria-pressed={isWatched}
                                                aria-label={isWatched ? 'Parar de assistir' : `Assistir sala ${game.game_id}`}
                                            >
                                                {isWatched ? '👁 Assistindo' : '👁 Assistir'}
                                            </button>
                                        )}
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            )}

            {/* ── Painel de Slow Reveal ── */}
            {watchGameId && (
                <div className="mt-6 space-y-5">
                    <BallDisplay
                        gameId={watchGameId}
                        drawnBalls={drawnBalls}
                        lastBall={lastBall}
                        isDrawing={isDrawing}
                        winners={winners}
                        isAborted={isAborted}
                        abortReason={abortReason}
                        wsStatus={wsStatus}
                    />

                    {/* Cartelas do jogador */}
                    {playerTickets.length > 0 && (
                        <div>
                            <h3 className="text-sm font-semibold text-[--cb-text-secondary] uppercase tracking-wide mb-3 flex items-center gap-2">
                                <span aria-hidden="true">🎴</span>
                                Minhas Cartelas — Sala #{watchGameId}
                                <span className="cb-badge cb-badge-neutral">{playerTickets.length}</span>
                            </h3>
                            <div className="flex flex-wrap gap-5">
                                {playerTickets.map((ticket, i) => (
                                    <div key={ticket.ticket_id} className="flex flex-col items-center gap-1.5">
                                        <span className="text-xs font-bold text-[--cb-text-tertiary]">
                                            #{i + 1}
                                        </span>
                                        <TicketGrid
                                            matrix={ticket.matrix}
                                            drawnBalls={drawnNumbers}
                                            lastDrawn={lastDrawnNumber}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Sem cartelas */}
                    {playerTickets.length === 0 && watchedGame?.status !== 'funding' && (
                        <p className="text-sm text-[--cb-text-tertiary] flex items-center gap-2">
                            <span aria-hidden="true">ℹ️</span>
                            Você não possui cartelas nesta sala.
                        </p>
                    )}
                </div>
            )}

            {/* ── Modal de compra ── */}
            {selectedGame && (
                <BuyTicketModal
                    gameId={selectedGame.game_id}
                    ticketPrice={selectedGame.ticket_price}
                    session={session}
                    onClose={() => setSelectedGame(null)}
                    onSuccess={handlePurchaseSuccess}
                />
            )}
        </section>
    );
}
