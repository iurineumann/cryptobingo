import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord } from '@cryptobingo/shared-types';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';

function parseHexBytes(hex: string): number[] {
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes: number[] = [];
  for (let i = 0; i < raw.length; i += 2) {
    bytes.push(parseInt(raw.substring(i, i + 2), 16));
  }
  return bytes;
}

export interface ReplayState {
  game: BlockchainGameState | null;
  tickets: Array<{ id: string; matrix: number[] }>;
  fullDrawnBalls: number[];
  revealedBalls: number[];
  revealedCount: number;
  totalBalls: number;
  isPlaying: boolean;
  isComplete: boolean;
  isLoading: boolean;
  speed: number;
  setSpeed: (speed: number) => void;
  togglePlay: () => void;
  skipToEnd: () => void;
  restart: () => void;
}

export function useReplay(gameId: string, session: Session): ReplayState {
  const [game, setGame] = useState<BlockchainGameState | null>(null);
  const [tickets, setTickets] = useState<Array<{ id: string; matrix: number[] }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setIsLoading(true);
      try {
        const [gameRes, ticketsRes] = await Promise.all([
          session.client.v1.chain.get_table_rows({
            code: CONTRACT, scope: CONTRACT, table: 'games',
            lower_bound: UInt64.from(gameId), upper_bound: UInt64.from(gameId), limit: 1, json: true,
          }),
          session.client.v1.chain.get_table_rows({
            code: CONTRACT, scope: UInt64.from(gameId), table: 'tickets',
            lower_bound: session.actor.value, upper_bound: session.actor.value,
            index_position: 'secondary', key_type: 'i64', limit: 50, json: true,
          }),
        ]);
        if (cancelled) return;

        const g = gameRes.rows[0] as BlockchainGameState | undefined;
        if (!g) return;

        // Busca max_balls do gametype para limitar o replay às bolas efetivamente usadas
        const gametypeId = String((g as any).gametype_id ?? '0');
        let maxBalls = 75;
        if (gametypeId !== '0') {
          try {
            const gtRes = await session.client.v1.chain.get_table_rows({
              code: CONTRACT, scope: CONTRACT, table: 'gametypes',
              lower_bound: UInt64.from(gametypeId), upper_bound: UInt64.from(gametypeId),
              limit: 1, json: true,
            });
            if (gtRes.rows.length) {
              const gt = gtRes.rows[0] as any;
              maxBalls = gt.max_balls > 0 ? gt.max_balls : 75;
            }
          } catch { /* usa default 75 */ }
        }
        if (!cancelled) setGame({ ...g, _maxBalls: maxBalls } as any);

        setTickets(
          (ticketsRes.rows as Array<BlockchainTicketRecord & { matrix: number[] | string }>).map(r => ({
            id: r.ticket_id,
            matrix: Array.isArray(r.matrix) ? r.matrix : parseHexBytes(r.matrix as string),
          }))
        );
      } catch (err) {
        console.error('[useReplay] Erro ao carregar:', err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [gameId, session]);

  const fullDrawnBalls = useMemo(() => {
    if (!game) return [];
    const raw = game.drawn_balls;
    const arr: number[] = Array.isArray(raw) ? raw : parseHexBytes(raw as unknown as string);
    const maxBalls: number = (game as any)._maxBalls ?? 75;
    return arr.slice(0, maxBalls).filter(b => b !== 0);
  }, [game]);

  const totalBalls = fullDrawnBalls.length;
  const revealedBalls = useMemo(() => fullDrawnBalls.slice(0, revealedCount), [fullDrawnBalls, revealedCount]);
  const isComplete = revealedCount >= totalBalls;

  useEffect(() => {
    if (!isPlaying || isComplete || totalBalls === 0) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }
    const interval = Math.max(200, 1200 - speed * 200);
    timerRef.current = setTimeout(() => {
      setRevealedCount(prev => Math.min(prev + 1, totalBalls));
    }, interval);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [isPlaying, revealedCount, totalBalls, speed, isComplete]);

  const togglePlay = useCallback(() => setIsPlaying(prev => !prev), []);
  const skipToEnd = useCallback(() => { setRevealedCount(totalBalls); setIsPlaying(false); }, [totalBalls]);
  const restart = useCallback(() => { setRevealedCount(0); setIsPlaying(false); }, []);

  return {
    game, tickets,
    fullDrawnBalls, revealedBalls, revealedCount, totalBalls,
    isPlaying, isComplete, isLoading,
    speed, setSpeed, togglePlay, skipToEnd, restart,
  };
}
