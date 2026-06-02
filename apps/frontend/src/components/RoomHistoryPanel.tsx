import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useGamesHistory } from '../hooks/useGamesHistory';

interface RoomHistoryPanelProps {
  roomId: string;
  session: Session;
  onViewReplay: (gameId: string) => void;
  onBack: () => void;
}

export default function RoomHistoryPanel({ roomId, session, onViewReplay, onBack }: RoomHistoryPanelProps) {
  const { t } = useTranslation();
  const { rows, loading, allLoaded, loadMore, reset } = useGamesHistory(session);

  useEffect(() => {
    reset();
    loadMore(roomId);
  }, [roomId]);

  const handleLoadMore = () => loadMore(roomId);

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onBack}>
          ← {t('replay.back_to_lobby')}
        </button>
        <h2 className="text-lg font-bold text-[--cb-text-primary]" style={{ margin: 0 }}>
          📽 {t('replay.room_history_title')} #{roomId}
        </h2>
      </div>

      {rows.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cb-text-tertiary)' }}>
          <p>{t('replay.no_history')}</p>
        </div>
      )}

      {rows.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="cb-table" style={{ width: '100%', minWidth: '36rem' }}>
            <thead>
              <tr>
                <th>{t('replay.col_date')}</th>
                <th>{t('replay.col_game')}</th>
                <th>{t('replay.col_tickets')}</th>
                <th>{t('replay.col_spent')}</th>
                <th>{t('replay.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.gameId}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
                    {r.endTime > 0
                      ? new Date(r.endTime * 1000).toLocaleString()
                      : '—'}
                  </td>
                  <td style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
                    #{r.gameId}
                  </td>
                  <td>{r.ticketsCount}</td>
                  <td style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
                    {r.totalSpent}
                  </td>
                  <td>
                    <button
                      className="cb-btn cb-btn-ghost cb-btn-sm"
                      onClick={() => onViewReplay(r.gameId)}
                    >
                      📽 {t('replay.view_replay')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {loading && (
        <div style={{ textAlign: 'center', padding: '1rem' }}>
          <span className="cb-spinner" style={{ width: '1.5rem', height: '1.5rem', borderWidth: '2px' }} />
        </div>
      )}

      {!allLoaded && !loading && rows.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={handleLoadMore}>
            {t('common.load_more')}
          </button>
        </div>
      )}
    </section>
  );
}
