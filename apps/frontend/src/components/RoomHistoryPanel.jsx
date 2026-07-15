// apps/frontend/src/components/RoomHistoryPanel.tsx
// Histórico GERAL da sala — visão pública (session opcional para visitantes).
// Exibe: barra de resumo lifetime + por partida: data, status, pool, jogadores,
//        cartelas, prêmios pagos (best-effort) e CTA Replay.
//
// Ref: ADR-015 (rota pública /room/:roomId/history)
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useRoomHistory } from '../hooks/useRoomHistory';
function formatDate(endTime) {
    if (endTime <= 0)
        return '—';
    const d = new Date(endTime * 1000);
    return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
        + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}
function parseQty(qty) {
    const parts = qty.trim().split(' ');
    return { amount: parseFloat(parts[0] ?? '0') || 0, symbol: parts.slice(1).join(' ') };
}
export default function RoomHistoryPanel({ roomId, session, onViewReplay, onBack, roomName, }) {
    const { t } = useTranslation();
    const { rows, loading, allLoaded, loadMore, reset } = useRoomHistory(session, roomId);
    useEffect(() => {
        reset();
        loadMore();
    }, [roomId]);
    // Totais lifetime calculados sobre as rows já carregadas
    const summary = useMemo(() => {
        let totalTickets = 0, totalWagered = 0, totalPaid = 0;
        let sym = 'BINGO';
        for (const r of rows) {
            totalTickets += r.totalTickets;
            const { amount, symbol } = parseQty(r.totalWagered);
            totalWagered += amount;
            if (symbol)
                sym = symbol;
            if (r.totalPaidOut != null)
                totalPaid += r.totalPaidOut;
        }
        const hasPaid = rows.some(r => r.totalPaidOut != null);
        return { games: rows.length, totalTickets, totalWagered, totalPaid, hasPaid, sym };
    }, [rows]);
    return (<div className="hist-shell" data-testid="room-history-page">

      {/* ── Cabeçalho ── */}
      <div className="hist-header">
        <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onBack} data-testid="room-history-back">
          ← {t('replay.back_to_lobby')}
        </button>
        <h2 className="hist-title" data-testid="room-history-title">
          {roomName ? roomName : `${t('replay.room_history_title')} #${roomId}`}
        </h2>
      </div>

      {/* ── Barra de resumo lifetime ── */}
      {summary.games > 0 && (<div className="hist-summary" data-testid="room-history-summary" style={{ marginBottom: '0.875rem' }}>
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_games', { count: summary.games, plural: summary.games !== 1 ? 's' : '' })}</span>
            <span className="value">{summary.games}</span>
          </div>
          <div className="hist-summary-sep"/>
          <div className="hist-summary-stat">
            <span className="label">{t('replay.col_tickets_sold')}</span>
            <span className="value">{summary.totalTickets.toLocaleString()}</span>
          </div>
          <div className="hist-summary-sep"/>
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_wagered')}</span>
            <span className="value">{summary.totalWagered.toFixed(4)} {summary.sym}</span>
          </div>
          {summary.hasPaid && (<>
              <div className="hist-summary-sep"/>
              <div className="hist-summary-stat">
                <span className="label">{t('replay.summary_paid_out')}</span>
                <span className="value gain">{summary.totalPaid.toFixed(4)} {summary.sym}</span>
              </div>
            </>)}
        </div>)}

      {/* ── Estado vazio ── */}
      {rows.length === 0 && !loading && (<div className="hist-empty" data-testid="room-history-empty">
          <span className="hist-empty-text">{t('replay.no_history')}</span>
        </div>)}

      {/* ── Lista de partidas ── */}
      {rows.length > 0 && (<div className="hist-list">
          {rows.map(r => {
                const pool = parseQty(r.totalWagered);
                const isAborted = r.status === 'aborted';
                return (<div key={r.gameId} data-testid={`room-history-row-${r.gameId}`} className={[
                        'hist-row',
                        r.myParticipation ? 'is-winner' : '',
                        isAborted ? 'is-aborted' : '',
                    ].filter(Boolean).join(' ')}>
                {/* Col 1: data + status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '4.5rem' }}>
                  <span className={`hist-badge${isAborted ? ' aborted' : r.myParticipation ? ' won' : ' lost'}`}>
                    {isAborted
                        ? `${t('replay.badge_aborted')}`
                        : r.myParticipation
                            ? t('replay.participated')
                            : `${r.status}`}
                  </span>
                  <span className="hist-row-date">{formatDate(r.endTime)}</span>
                  <span className="hist-row-game">#{r.gameId}</span>
                </div>

                {/* Col 2: stats da partida */}
                <div className="hist-row-info">
                  <div className="hist-row-amounts">
                    {/* Pool coletado (= total arrecadado) */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_pool')}</span>
                      <span className="avalue" style={{ color: 'var(--cb-accent)', fontWeight: 700 }}>
                        {pool.amount.toFixed(4)}
                        <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.2rem' }}>{pool.symbol}</span>
                      </span>
                    </div>

                    {/* Total pago aos vencedores (best-effort do ledger) */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_paid_out')}</span>
                      <span className={`avalue${r.totalPaidOut != null ? ' gain' : ''}`}>
                        {r.totalPaidOut != null
                        ? `${r.totalPaidOut.toFixed(4)} ${r.symbol}`
                        : '—'}
                      </span>
                    </div>

                    {/* Jogadores */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_players')}</span>
                      <span className="avalue">{r.totalPlayers > 0 ? r.totalPlayers : '—'}</span>
                    </div>

                    {/* Cartelas */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_tickets_sold')}</span>
                      <span className="avalue">{r.totalTickets > 0 ? r.totalTickets : '—'}</span>
                    </div>
                  </div>
                </div>

                {/* Col 3: CTA */}
                <div className="hist-row-action">
                  {!isAborted && (<button className="cb-btn cb-btn-primary cb-btn-sm" data-testid={`room-history-replay-${r.gameId}`} onClick={() => onViewReplay(r.gameId)} style={{ gap: '0.375rem' }}>
                      {t('replay.view_replay')}
                    </button>)}
                </div>
              </div>);
            })}
        </div>)}

      {/* ── Loading ── */}
      {loading && (<div style={{ display: 'flex', justifyContent: 'center', padding: '1.25rem' }}>
          <span className="cb-spinner" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }}/>
        </div>)}

      {/* ── Load more ── */}
      {!allLoaded && !loading && rows.length > 0 && (<div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={loadMore} data-testid="room-history-load-more">
            {t('common.load_more')}
          </button>
        </div>)}
    </div>);
}
//# sourceMappingURL=RoomHistoryPanel.js.map