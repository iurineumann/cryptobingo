// apps/frontend/src/components/MyHistoryPage.tsx
// Histórico pessoal de partidas do jogador.
// Design: classes hist-* definidas em globals.design.css

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useGamesHistory } from '../hooks/useGamesHistory';
import { X } from 'lucide-react';

interface MyHistoryPageProps {
  session: Session;
  onViewReplay: (gameId: string) => void;
}

function formatDate(endTime: number): string {
  if (endTime <= 0) return '—';
  const d = new Date(endTime * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function parseAmount(str: string): number {
  if (!str || str === '—') return 0;
  return parseFloat(str.split(' ')[0]) || 0;
}

function extractSymbol(str: string): string {
  if (!str || str === '—') return '';
  const parts = str.trim().split(' ');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

export default function MyHistoryPage({ session, onViewReplay }: MyHistoryPageProps) {
  const { t } = useTranslation();
  const { rows, loading, allLoaded, loadMore, reset } = useGamesHistory(session);
  const [roomFilter, setRoomFilter] = useState<string>('');

  useEffect(() => {
    reset();
    loadMore();
  }, []);

  const roomIds = useMemo(() => {
    const ids = new Set(rows.map(r => r.roomId).filter(id => id && id !== '0'));
    return Array.from(ids).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!roomFilter) return rows;
    return rows.filter(r => r.roomId === roomFilter);
  }, [rows, roomFilter]);

  const symbol = useMemo(() => {
    for (const r of rows) {
      const s = extractSymbol(r.totalSpent);
      if (s) return s;
    }
    return 'BINGO';
  }, [rows]);

  const summary = useMemo(() => {
    const src = roomFilter ? filtered : rows;
    let spent = 0, won = 0, winGames = 0, bestWon = 0;
    for (const r of src) {
      spent += parseAmount(r.totalSpent);
      const w = parseAmount(r.totalWon);
      won += w;
      if (w > 0) winGames++;
      if (w > bestWon) bestWon = w;
    }
    const winRate = src.length > 0 ? (winGames / src.length) * 100 : 0;
    return { games: src.length, spent, won, balance: won - spent, winGames, winRate, bestWon };
  }, [rows, filtered, roomFilter]);

  return (
    <div className="hist-shell" data-testid="myhistory-page">
      {/* ── Cabeçalho ── */}
      <div className="hist-header">
        <h2 className="hist-title" data-testid="myhistory-title">
          {t('replay.my_history_title')}
        </h2>
        {roomIds.length > 1 && (
          <select
            className="cb-input"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            style={{ padding: '0.3rem 2rem 0.3rem 0.75rem', fontSize: '0.8rem', width: 'auto' }}
            aria-label={t('replay.filter_room')}
            data-testid="myhistory-filter"
          >
            <option value="">{t('replay.filter_all')}</option>
            {roomIds.map(id => (
              <option key={id} value={id}>{t('replay.room_option', { id })}</option>
            ))}
          </select>
        )}
      </div>

      {/* ── Barra de resumo ── */}
      {summary.games > 0 && (
        <div className="hist-summary" data-testid="myhistory-summary" style={{ marginBottom: '0.875rem' }}>
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_games', { count: summary.games, plural: summary.games !== 1 ? 's' : '' })}</span>
            <span className="value">{summary.winGames} vitória{summary.winGames !== 1 ? 's' : ''}</span>
          </div>
          <div className="hist-summary-sep" />
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_win_rate')}</span>
            <span className={`value${summary.winRate > 0 ? ' gain' : ''}`}>{summary.winRate.toFixed(1)}%</span>
          </div>
          <div className="hist-summary-sep" />
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_spent')}</span>
            <span className="value">{summary.spent.toFixed(4)} {symbol}</span>
          </div>
          <div className="hist-summary-sep" />
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_won')}</span>
            <span className={`value${summary.won > 0 ? ' gain' : ''}`}>{summary.won.toFixed(4)} {symbol}</span>
          </div>
          <div className="hist-summary-sep" />
          <div className="hist-summary-stat">
            <span className="label">{t('replay.summary_balance')}</span>
            <span className={`value ${summary.balance >= 0 ? 'gain' : 'loss'}`}>
              {summary.balance >= 0 ? '+' : ''}{summary.balance.toFixed(4)} {symbol}
            </span>
          </div>
        </div>
      )}

      {/* ── Lista de partidas ── */}
      {filtered.length === 0 && !loading && (
        <div className="hist-empty" data-testid="myhistory-empty">
                          <span className="hist-empty-text">{t('replay.no_history')}</span>
        </div>
      )}

      {filtered.length > 0 && (
        <div className="hist-list">
          {filtered.map(r => {
            const wonAmt   = parseAmount(r.totalWon);
            const spentAmt = parseAmount(r.totalSpent);
            const isWinner = wonAmt > 0;
            const isAborted = r.status === 'aborted';
            const roi = spentAmt > 0 ? ((wonAmt - spentAmt) / spentAmt) * 100 : null;
            const sym = r.symbol ?? extractSymbol(r.totalSpent);

            return (
              <div
                key={r.gameId}
                className={`hist-row${isWinner ? ' is-winner' : ''}${isAborted ? ' is-aborted' : ''}`}
                data-testid={`myhistory-row-${r.gameId}`}
              >
                {/* Col 1: badge */}
                <div>
                  {isAborted ? (
                    <span className="hist-badge aborted"><X className="size-3 shrink-0" /> {t('replay.badge_aborted')}</span>
                  ) : isWinner ? (
                    <span className="hist-badge won">{t('replay.badge_won')}</span>
                  ) : (
                    <span className="hist-badge lost">{t('replay.badge_lost')}</span>
                  )}
                  {/* ROI% do jogador nesta partida */}
                  {roi != null && !isAborted && (
                    <span style={{ display: 'block', fontSize: '0.65rem', marginTop: '0.25rem', fontWeight: 700, color: roi >= 0 ? 'var(--cb-success)' : 'var(--cb-danger)' }}>
                      {roi >= 0 ? '+' : ''}{roi.toFixed(0)}% ROI
                    </span>
                  )}
                </div>

                {/* Col 2: info */}
                <div className="hist-row-info">
                  <div className="hist-row-meta">
                    <span className="hist-row-game">#{r.gameId}</span>
                    {r.roomId && r.roomId !== '0' && (
                      <span className="hist-row-room">Sala #{r.roomId}</span>
                    )}
                    <span className="hist-row-date">{formatDate(r.endTime)}</span>
                  </div>
                  <div className="hist-row-amounts">
                    {/* ── Dados do jogador ── */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_tickets')}</span>
                      <span className="avalue">{r.ticketsCount}</span>
                    </div>
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_spent')}</span>
                      <span className="avalue">{r.totalSpent}</span>
                    </div>
                    {r.totalWon && r.totalWon !== '—' && (
                      <div className="hist-row-amount">
                        <span className="alabel">{t('replay.col_won')}</span>
                        <span className={`avalue${isWinner ? ' won-amount' : ''}`}>{r.totalWon}</span>
                      </div>
                    )}
                    {/* ── Dados globais da partida (best-effort) ── */}
                    {r.allTickets != null && (
                      <div className="hist-row-amount" style={{ borderLeft: '1px solid var(--cb-border-subtle)', paddingLeft: '0.5rem', marginLeft: '0.25rem' }}>
                        <span className="alabel">{t('replay.col_all_tickets')}</span>
                        <span className="avalue">{r.allTickets}</span>
                      </div>
                    )}
                    {r.totalWagered != null && (
                      <div className="hist-row-amount">
                        <span className="alabel">{t('replay.col_total_wagered')}</span>
                        <span className="avalue">{r.totalWagered.toFixed(4)} {sym}</span>
                      </div>
                    )}
                    {r.totalPaidOut != null && (
                      <div className="hist-row-amount">
                        <span className="alabel">{t('replay.col_total_paid')}</span>
                        <span className="avalue gain">{r.totalPaidOut.toFixed(4)} {sym}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Col 3: CTA */}
                <div className="hist-row-action">
                  <button
                    className="cb-btn cb-btn-primary cb-btn-sm"
                    onClick={() => onViewReplay(r.gameId)}
                    style={{ gap: '0.375rem' }}
                    data-testid={`myhistory-replay-${r.gameId}`}
                  >
                    {t('replay.view_replay')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Loading / Load more ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.25rem' }}>
          <span className="cb-spinner" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }} />
        </div>
      )}

      {!allLoaded && !loading && rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={() => loadMore()} data-testid="myhistory-load-more">
            {t('common.load_more')}
          </button>
        </div>
      )}
    </div>
  );
}
