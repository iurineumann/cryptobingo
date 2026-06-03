// apps/frontend/src/components/RoomHistoryPanel.tsx
// Histórico GERAL da sala — todas as partidas, visão pública.
// Exibe: data, status, pool coletado, jogadores, cartelas, participação do usuário, CTA Replay.
//
// Design: classes hist-* definidas em globals.design.css

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useRoomHistory } from '../hooks/useRoomHistory';

interface RoomHistoryPanelProps {
  roomId:        string;
  session:       Session;
  onViewReplay:  (gameId: string) => void;
  onBack:        () => void;
}

const STATUS_EMOJI: Record<string, string> = {
  archived: '✅', drawn: '✅', aborted: '❌',
};

function formatDate(endTime: number): string {
  if (endTime <= 0) return '—';
  const d = new Date(endTime * 1000);
  return d.toLocaleDateString(undefined, { day: '2-digit', month: '2-digit', year: '2-digit' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function splitAmount(quantity: string): { amount: string; symbol: string } {
  const parts = quantity.trim().split(' ');
  return { amount: parts[0] ?? '0', symbol: parts.slice(1).join(' ') };
}

export default function RoomHistoryPanel({
  roomId, session, onViewReplay, onBack,
}: RoomHistoryPanelProps) {
  const { t } = useTranslation();
  const { rows, loading, allLoaded, loadMore, reset } = useRoomHistory(session, roomId);

  useEffect(() => {
    reset();
    loadMore();
  }, [roomId]);

  return (
    <div className="hist-shell">

      {/* ── Cabeçalho ── */}
      <div className="hist-header">
        <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onBack}>
          ← {t('replay.back_to_lobby')}
        </button>
        <h2 className="hist-title">
          📋 {t('replay.room_history_title')} #{roomId}
        </h2>
      </div>

      {/* ── Estado vazio ── */}
      {rows.length === 0 && !loading && (
        <div className="hist-empty">
          <span className="hist-empty-icon">📋</span>
          <span className="hist-empty-text">{t('replay.no_history')}</span>
        </div>
      )}

      {/* ── Lista de partidas ── */}
      {rows.length > 0 && (
        <div className="hist-list">
          {rows.map(r => {
            const pool    = splitAmount(r.prizePool);
            const isAborted = r.status === 'aborted';

            return (
              <div
                key={r.gameId}
                className={[
                  'hist-row',
                  r.myParticipation ? 'is-winner' : '',
                  isAborted ? 'is-aborted' : '',
                ].filter(Boolean).join(' ')}
              >
                {/* Col 1: data + status */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', minWidth: '4.5rem' }}>
                  <span className={`hist-badge${isAborted ? ' aborted' : r.myParticipation ? ' won' : ' lost'}`}>
                    {isAborted
                      ? `✕ ${t('replay.badge_aborted')}`
                      : r.myParticipation
                        ? `🎫 ${t('replay.participated')}`
                        : `${STATUS_EMOJI[r.status] ?? ''} ${r.status}`
                    }
                  </span>
                  <span className="hist-row-date">{formatDate(r.endTime)}</span>
                  <span className="hist-row-game">#{r.gameId}</span>
                </div>

                {/* Col 2: stats da partida */}
                <div className="hist-row-info">
                  <div className="hist-row-amounts">
                    {/* Pool coletado */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_pool')}</span>
                      <span className="avalue" style={{ color: 'var(--cb-accent)', fontWeight: 700 }}>
                        {pool.amount}
                        <span style={{ fontSize: '0.65rem', opacity: 0.7, marginLeft: '0.2rem' }}>{pool.symbol}</span>
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
                      <span className="avalue">
                        {r.totalTickets > 0 ? r.totalTickets : '—'}
                      </span>
                    </div>

                    {/* Preço do ticket */}
                    <div className="hist-row-amount">
                      <span className="alabel">{t('replay.col_spent')}</span>
                      <span className="avalue">{r.ticketPrice}</span>
                    </div>
                  </div>
                </div>

                {/* Col 3: CTA */}
                <div className="hist-row-action">
                  {!isAborted && (
                    <button
                      className="cb-btn cb-btn-primary cb-btn-sm"
                      onClick={() => onViewReplay(r.gameId)}
                      style={{ gap: '0.375rem' }}
                    >
                      ▶ {t('replay.view_replay')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Loading ── */}
      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '1.25rem' }}>
          <span className="cb-spinner" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }} />
        </div>
      )}

      {/* ── Load more ── */}
      {!allLoaded && !loading && rows.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.75rem' }}>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={loadMore}>
            {t('common.load_more')}
          </button>
        </div>
      )}
    </div>
  );
}
