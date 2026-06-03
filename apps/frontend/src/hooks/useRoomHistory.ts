// apps/frontend/src/hooks/useRoomHistory.ts
// Histórico GERAL de uma sala — todas as partidas, independentemente de participação.
// Exibe dados públicos por partida: jogadores, cartelas, pool coletado.
//
// Diferente de useGamesHistory (visão do jogador): aqui não há filtro por tickets
// do usuário logado. Exibimos o histórico da sala como um todo.

import { useState, useRef, useCallback } from 'react';
import { Session } from '@wharfkit/session';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState } from '@cryptobingo/shared-types';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

const PAGE_SIZE  = 15;   // rows de partidas por "carregar mais"
const FETCH_BATCH = 50;  // games buscados do blockchain por request

// Máx. tickets escaneados por partida (para contar jogadores/cartelas)
const TICKET_SCAN_LIMIT = 500;

export interface RoomGameRow {
  gameId:          string;
  status:          string;
  endTime:         number;
  prizePool:       string;   // total coletado ("X.XXXX TOKEN")
  ticketPrice:     string;   // preço padrão do ticket
  totalTickets:    number;   // cartelas vendidas (≤ TICKET_SCAN_LIMIT)
  totalPlayers:    number;   // donos únicos das cartelas
  myParticipation: boolean;  // jogador logado participou?
}

export function useRoomHistory(session: Session, roomId: string) {
  const [rows,      setRows]      = useState<RoomGameRow[]>([]);
  const [loading,   setLoading]   = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // Cursor pela chave primária (game_id) em ordem decrescente
  const cursorRef      = useRef<bigint | undefined>(undefined);
  const noMoreChainRef = useRef(false);

  const loadMore = useCallback(async () => {
    if (loading || allLoaded) return;
    setLoading(true);

    try {
      const collected: RoomGameRow[] = [];

      // Continua buscando lotes do blockchain até preencher PAGE_SIZE linhas
      // desta sala específica, ou esgotar a tabela.
      while (collected.length < PAGE_SIZE && !noMoreChainRef.current) {

        // ── 1. Busca lote de games (mais recente → mais antigo) ──────────────
        const upperBound = cursorRef.current !== undefined
          ? { upper_bound: UInt64.from(String(cursorRef.current)) }
          : {};

        const gamesRes = await session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          limit: FETCH_BATCH,
          reverse: true,
          json: true,
          ...upperBound,
        });

        const games = gamesRes.rows as BlockchainGameState[];

        if (games.length < FETCH_BATCH || !gamesRes.more) {
          noMoreChainRef.current = true;
        }

        if (games.length === 0) break;

        // Avança cursor
        const oldest  = games[games.length - 1];
        const oldestId = BigInt(oldest.game_id);
        cursorRef.current = oldestId > 0n ? oldestId - 1n : undefined;
        if (cursorRef.current === undefined) noMoreChainRef.current = true;

        // ── 2. Filtra por sala e status encerrado ────────────────────────────
        const candidates = games.filter(g =>
          String(g.room_id) === String(roomId) &&
          ['archived', 'drawn', 'aborted'].includes(g.status)
        );

        if (candidates.length === 0) continue;

        // ── 3. Busca tickets de cada partida candidata ───────────────────────
        const ticketResults = await Promise.allSettled(
          candidates.map(g =>
            session.client.v1.chain.get_table_rows({
              code: CONTRACT, scope: UInt64.from(g.game_id),
              table: 'tickets', limit: TICKET_SCAN_LIMIT, json: true,
            })
          )
        );

        const actorStr = String(session.actor);

        for (let i = 0; i < candidates.length; i++) {
          const game    = candidates[i];
          const result  = ticketResults[i];
          const tickets = result.status === 'fulfilled'
            ? (result.value.rows as Array<{ owner: string }>)
            : [];

          const totalTickets   = tickets.length;
          const owners         = new Set(tickets.map(t => t.owner));
          const totalPlayers   = owners.size;
          const myParticipation = owners.has(actorStr);

          collected.push({
            gameId:          game.game_id,
            status:          game.status,
            endTime:         game.end_time,
            prizePool:       game.prize_pool?.quantity ?? '—',
            ticketPrice:     game.ticket_price?.quantity ?? '—',
            totalTickets,
            totalPlayers,
            myParticipation,
          });

          if (collected.length >= PAGE_SIZE) break;
        }
      }

      if (noMoreChainRef.current) setAllLoaded(true);

      if (collected.length > 0) {
        setRows(prev =>
          [...prev, ...collected].sort(
            (a, b) => Number(BigInt(b.gameId) - BigInt(a.gameId))
          )
        );
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
