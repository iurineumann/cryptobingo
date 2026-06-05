// apps/frontend/src/hooks/useRoomHistory.ts
// Histórico GERAL de uma sala — todas as partidas, visão pública.
// Aceita session=null para visitantes não autenticados (ADR-015).
//
// Fluxo de dados:
//   1. Blockchain (get_table_rows): games + tickets por partida
//   2. API Gateway (best-effort): total_paid_out de games_history PostgreSQL

import { useState, useRef, useCallback } from 'react';
import { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState } from '@cryptobingo/shared-types';
import { fetchTableRows } from '../utils/rpc';
import { fetchBatchGameStats } from '../services/api';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

const PAGE_SIZE        = 15;
const FETCH_BATCH      = 50;
const TICKET_SCAN_LIMIT = 500;

export interface RoomGameRow {
  gameId:          string;
  status:          string;
  endTime:         number;
  totalWagered:       string;
  ticketPrice:     string;
  totalTickets:    number;
  totalPlayers:    number;
  myParticipation: boolean;
  totalPaidOut?:   number;  // best-effort do ledger; undefined = não sincronizado
  symbol:          string;
}

export function useRoomHistory(session: Session | null | undefined, roomId: string) {
  const [rows,      setRows]      = useState<RoomGameRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  const cursorRef      = useRef<bigint | undefined>(undefined);
  const noMoreChainRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading || allLoaded) return;
    setLoading(true);

    try {
      const collected: RoomGameRow[] = [];

      while (collected.length < PAGE_SIZE && !noMoreChainRef.current) {
        // ── 1. Busca lote de games ──────────────────────────────────────────
        const upperBound = cursorRef.current !== undefined
          ? { upper_bound: String(cursorRef.current) }
          : {};

        const gamesRes = await fetchTableRows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          limit: FETCH_BATCH, reverse: true, ...upperBound,
        }, session);

        const games = gamesRes.rows as BlockchainGameState[];

        if (games.length < FETCH_BATCH || !gamesRes.more) {
          noMoreChainRef.current = true;
        }
        if (games.length === 0) break;

        const oldest = games[games.length - 1];
        const oldestId = BigInt(oldest.game_id);
        cursorRef.current = oldestId > 0n ? oldestId - 1n : undefined;
        if (cursorRef.current === undefined) noMoreChainRef.current = true;

        // ── 2. Filtra por sala e status encerrado ────────────────────────────
        const candidates = games.filter(g =>
          String(g.room_id) === String(roomId) &&
          ['archived', 'drawn', 'aborted'].includes(g.status)
        );
        if (candidates.length === 0) continue;

        // ── 3. Busca tickets de cada partida ─────────────────────────────────
        const ticketResults = await Promise.allSettled(
          candidates.map(g =>
            fetchTableRows({
              code: CONTRACT, scope: UInt64.from(g.game_id).toString(),
              table: 'tickets', limit: TICKET_SCAN_LIMIT,
            }, session)
          )
        );

        const actorStr = session ? String(session.actor) : '';

        for (let i = 0; i < candidates.length; i++) {
          const game   = candidates[i];
          const result = ticketResults[i];
          const tickets = result.status === 'fulfilled'
            ? (result.value.rows as Array<{ owner: string }>)
            : [];

          const owners         = new Set(tickets.map(t => t.owner));
          const sym            = (game.total_wagered?.quantity ?? '').trim().split(' ').slice(1).join(' ') || 'BINGO';

          collected.push({
            gameId:          game.game_id,
            status:          game.status,
            endTime:         game.end_time,
            totalWagered:       game.total_wagered?.quantity ?? '—',
            ticketPrice:     game.ticket_price?.quantity ?? '—',
            totalTickets:    tickets.length,
            totalPlayers:    owners.size,
            myParticipation: actorStr ? owners.has(actorStr) : false,
            symbol:          sym,
          });

          if (collected.length >= PAGE_SIZE) break;
        }
      }

      if (noMoreChainRef.current) setAllLoaded(true);

      if (collected.length > 0) {
        // Merge sem duplicatas e mantém ordem decrescente
        setRows(prev => {
          const seen = new Set(prev.map(r => r.gameId));
          const merged = [...prev, ...collected.filter(r => !seen.has(r.gameId))];
          return merged.sort((a, b) => Number(BigInt(b.gameId) - BigInt(a.gameId)));
        });

        // Enriquece com dados do ledger (best-effort, sem bloquear UI)
        const gameIds = collected.map(r => r.gameId);
        fetchBatchGameStats(gameIds).then(stats => {
          if (Object.keys(stats).length === 0) return;
          setRows(prev => prev.map(r => {
            const s = stats[r.gameId];
            return s ? { ...r, totalPaidOut: s.totalPaidOut } : r;
          }));
        }).catch(() => {});
      }
    } catch (err) {
      console.error('[useRoomHistory]', err);
    } finally {
      setLoading(false);
    }
  }, [session, roomId, loading, allLoaded]);

  const reset = useCallback(() => {
    setRows([]);
    setAllLoaded(false);
    cursorRef.current      = undefined;
    noMoreChainRef.current = false;
  }, []);

  return { rows, loading, allLoaded, loadMore, reset };
}
