import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { useGamesHistory } from '../hooks/useGamesHistory';

interface MyHistoryPageProps {
  session: Session;
  onViewReplay: (gameId: string) => void;
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

  const handleLoadMore = () => loadMore();

  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        <h2 className="text-lg font-bold text-[--cb-text-primary]" style={{ margin: 0 }}>
          📋 {t('replay.my_history_title')}
        </h2>

        {roomIds.length > 1 && (
          <select
            className="cb-input cb-select"
            value={roomFilter}
            onChange={e => setRoomFilter(e.target.value)}
            style={{ padding: '0.3rem 2rem 0.3rem 0.6rem', fontSize: '0.8rem', width: 'auto' }}
            aria-label={t('replay.filter_room')}
          >
            <option value="">{t('replay.filter_all')}</option>
            {roomIds.map(id => (
              <option key={id} value={id}>{t('replay.room_option', { id })}</option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '3rem 1rem', color: 'var(--cb-text-tertiary)' }}>
          <p>{t('replay.no_history')}</p>
        </div>
      )}

      {filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="cb-table" style={{ width: '100%', minWidth: '42rem' }}>
            <thead>
              <tr>
                <th>{t('replay.col_date')}</th>
                <th>{t('replay.col_room')}</th>
                <th>{t('replay.col_game')}</th>
                <th>{t('replay.col_tickets')}</th>
                <th>{t('replay.col_spent')}</th>
                <th>{t('replay.col_action')}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.gameId}>
                  <td style={{ whiteSpace: 'nowrap', fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
                    {r.endTime > 0
                      ? new Date(r.endTime * 1000).toLocaleString()
                      : '—'}
                  </td>
                  <td style={{ fontSize: '0.8rem' }}>
                    {r.roomId && r.roomId !== '0' ? `#${r.roomId}` : '—'}
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

      {!allLoaded && !loading && filtered.length > 0 && (
        <div style={{ textAlign: 'center', marginTop: '1rem' }}>
          <button className="cb-btn cb-btn-outline cb-btn-sm" onClick={handleLoadMore}>
            {t('common.load_more')}
          </button>
        </div>
      )}
    </section>
  );
}
