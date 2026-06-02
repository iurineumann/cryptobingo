import { useState, useRef, useCallback } from 'react';
import { Session } from '@wharfkit/session';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord } from '@cryptobingo/shared-types';
import { fetchBatchWinnings, getAuthToken } from '../services/api';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

export interface GameHistoryRow {
  gameId: string;
  roomId: string;
  status: string;
  endTime: number;
  ticketsCount: number;
  totalSpent: string;
  totalWon: string;
}

function formatQuantity(price: string, count: number): string {
  const parts = price.split(' ');
  const amount = parseFloat(parts[0]) * count;
  return `${amount.toFixed(4)} ${parts.slice(1).join(' ')}`;
}

const REPLAY_STATUSES = new Set(['archived', 'drawn', 'aborted']);

export function useGamesHistory(session: Session) {
  const [rows, setRows] = useState<GameHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);
  const cursorRef = useRef<string | undefined>(undefined);

  const loadMore = useCallback(async (roomId?: string) => {
    if (loading || allLoaded) return;
    setLoading(true);
    try {
      const gamesRes = await session.client.v1.chain.get_table_rows({
        code: CONTRACT, scope: CONTRACT, table: 'games',
        limit: 20,
        ...(cursorRef.current ? { lower_bound: UInt64.from(cursorRef.current) } : {}),
        json: true,
      });

      const games = gamesRes.rows as BlockchainGameState[];
      if (games.length < 20 || !gamesRes.more) setAllLoaded(true);
      if (games.length > 0) {
        const last = games[games.length - 1];
        cursorRef.current = String(BigInt(last.game_id) + 1n);
      }

      const filtered = roomId ? games.filter(g => g.room_id === roomId) : games;
      const candidates = filtered.filter(g => REPLAY_STATUSES.has(g.status));

      const ticketResults = await Promise.all(
        candidates.map(async (game) => {
          try {
            const res = await session.client.v1.chain.get_table_rows({
              code: CONTRACT, scope: UInt64.from(game.game_id), table: 'tickets',
              lower_bound: Name.from(session.actor).value,
              upper_bound: Name.from(session.actor).value,
              index_position: 'secondary', key_type: 'i64', limit: 50, json: true,
            });
            return { game, tickets: res.rows as BlockchainTicketRecord[] };
          } catch {
            return { game, tickets: [] };
          }
        })
      );

      const newRows: GameHistoryRow[] = ticketResults
        .filter(r => r.tickets.length > 0)
        .map(r => ({
          gameId: r.game.game_id,
          roomId: r.game.room_id,
          status: r.game.status,
          endTime: r.game.end_time,
          ticketsCount: r.tickets.length,
          totalSpent: formatQuantity(r.game.ticket_price.quantity, r.tickets.length),
          totalWon: '—',
        }));

      setRows(prev => [...prev, ...newRows].sort((a, b) => Number(b.gameId) - Number(a.gameId)));

      // Fetch winnings from API gateway (best-effort)
      if (newRows.length > 0 && getAuthToken()) {
        const gameIds = newRows.map(r => r.gameId);
        fetchBatchWinnings(gameIds).then(({ winnings }) => {
          setRows(prev => prev.map(r => ({
            ...r,
            totalWon: winnings[r.gameId] != null
              ? `${Number(winnings[r.gameId]).toFixed(4)} BINGO`
              : '—',
          })));
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[useGamesHistory]', err);
    } finally {
      setLoading(false);
    }
  }, [session, loading, allLoaded]);

  const reset = useCallback(() => {
    setRows([]);
    setAllLoaded(false);
    cursorRef.current = undefined;
  }, []);

  return { rows, loading, allLoaded, loadMore, reset };
}
