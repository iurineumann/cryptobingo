import { useState, useRef, useCallback } from 'react';
import { Session } from '@wharfkit/session';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord } from '@cryptobingo/shared-types';
import { fetchBatchWinnings, getAuthToken } from '../services/api';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

/** Quantas linhas de partidas do jogador queremos por "página". */
const PAGE_SIZE = 20;

/** Quantas partidas buscamos do blockchain por request (sem relação com PAGE_SIZE). */
const FETCH_BATCH = 50;

export interface GameHistoryRow {
  gameId: string;
  roomId: string;
  status: string;
  endTime: number;
  ticketsCount: number;
  totalSpent: string;
  totalWon: string;
}

const REPLAY_STATUSES = new Set(['archived', 'drawn', 'aborted']);

export function useGamesHistory(session: Session) {
  const [rows, setRows] = useState<GameHistoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [allLoaded, setAllLoaded] = useState(false);

  // Cursor para a próxima página do blockchain (bigint = game_id - 1 do lote anterior).
  // undefined = início (mais recente).
  const cursorRef    = useRef<bigint | undefined>(undefined);
  // true quando o blockchain já não tem mais partidas para retornar.
  const noMoreChainRef = useRef(false);

  const loadMore = useCallback(async (roomId?: string) => {
    if (loading || allLoaded) return;
    setLoading(true);

    try {
      const collected: GameHistoryRow[] = [];

      // Continua buscando lotes do blockchain até preencher PAGE_SIZE linhas
      // com tickets do jogador OU até esgotar a tabela.
      while (collected.length < PAGE_SIZE && !noMoreChainRef.current) {
        // ── 1. Busca lote de partidas (mais recente → mais antiga) ────────────
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

        // Verifica se há mais partidas no blockchain
        if (games.length < FETCH_BATCH || !gamesRes.more) {
          noMoreChainRef.current = true;
        }

        if (games.length === 0) break;

        // Avança cursor para o próximo lote
        const oldest = games[games.length - 1];
        const oldestId = BigInt(oldest.game_id);
        cursorRef.current = oldestId > 0n ? oldestId - 1n : undefined;
        if (cursorRef.current === undefined) noMoreChainRef.current = true;

        // ── 2. Filtra partidas elegíveis para histórico ───────────────────────
        const candidates = games.filter(g =>
          REPLAY_STATUSES.has(g.status) &&
          (!roomId || g.room_id === roomId)
        );

        if (candidates.length === 0) continue;

        // ── 3. Verifica tickets do jogador em cada partida candidata ─────────
        const ticketResults = await Promise.all(
          candidates.map(async (game) => {
            try {
              const res = await session.client.v1.chain.get_table_rows({
                code: CONTRACT, scope: UInt64.from(game.game_id), table: 'tickets',
                lower_bound: Name.from(session.actor).value,
                upper_bound: Name.from(session.actor).value,
                index_position: 'secondary', key_type: 'i64',
                limit: 50, json: true,
              });
              return { game, tickets: res.rows as BlockchainTicketRecord[] };
            } catch {
              return { game, tickets: [] as BlockchainTicketRecord[] };
            }
          })
        );

        for (const r of ticketResults) {
          if (r.tickets.length === 0) continue;
          // Soma os preços reais de cada ticket (ADR-010 variable pricing).
          // Tickets legados sem o campo price fazem fallback ao game.ticket_price.
          const totalPaid = r.tickets.reduce((sum, t) => {
            const qty = t.price?.quantity ?? r.game.ticket_price.quantity;
            return sum + (parseFloat(qty.split(' ')[0]) || 0);
          }, 0);
          const sym = (r.tickets[0]?.price?.quantity ?? r.game.ticket_price.quantity)
            .trim().split(' ').slice(1).join(' ') || 'BINGO';
          collected.push({
            gameId:       r.game.game_id,
            roomId:       r.game.room_id,
            status:       r.game.status,
            endTime:      r.game.end_time,
            ticketsCount: r.tickets.length,
            totalSpent:   `${totalPaid.toFixed(4)} ${sym}`,
            totalWon:     '—',
          });
          // Para assim que preenchemos a página — não busca mais do que o necessário
          if (collected.length >= PAGE_SIZE) break;
        }
      }

      // Se o blockchain esgotou E não coletamos nada mais, marca como concluído
      if (noMoreChainRef.current) setAllLoaded(true);

      if (collected.length > 0) {
        // Mantém ordem decrescente por game_id (mais recente primeiro), sem duplicatas
        setRows(prev => {
          const seen = new Set(prev.map(r => r.gameId));
          const merged = [...prev, ...collected.filter(r => !seen.has(r.gameId))];
          return merged.sort((a, b) => Number(BigInt(b.gameId) - BigInt(a.gameId)));
        });

        // Busca prêmios do gateway (best-effort)
        if (getAuthToken()) {
          const gameIds = collected.map(r => r.gameId);
          fetchBatchWinnings(gameIds).then(({ winnings }) => {
            setRows(prev => prev.map(r => ({
              ...r,
              totalWon: winnings[r.gameId] != null
                ? `${Number(winnings[r.gameId]).toFixed(4)} BINGO`
                : r.totalWon,
            })));
          }).catch(() => {});
        }
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
    cursorRef.current    = undefined;
    noMoreChainRef.current = false;
  }, []);

  return { rows, loading, allLoaded, loadMore, reset };
}
