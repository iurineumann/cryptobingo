import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainTicketRecord } from '@cryptobingo/shared-types';
import { Pattern, fetchGamePatterns, isCombinationSatisfied, type CombinationRuleInput, type ExtendedRule } from '../components/ticketUtils';
import { fetchPublicGametypeMetadata } from '../services/api';

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';

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
  patterns: Pattern[];
  combinations: CombinationRuleInput[];
  patternWinCount: Map<string, number>;
  combinationWinCount: Map<string, number>;
  winners: Array<{ ticket_id: string; patterns: Pattern[] }>;
  goldenBall: { ballNum: number; multiplier: number } | null;
  gameEnded: boolean;
  setSpeed: (speed: number) => void;
  togglePlay: () => void;
  skipToEnd: () => void;
  restart: () => void;
}

function buildGrid(matrix: number[]): (number | null)[][] {
  const B    = matrix.slice(0, 5);
  const I    = matrix.slice(5, 10);
  const Nraw = matrix.slice(10, 14);
  const G    = matrix.slice(14, 19);
  const O    = matrix.slice(19, 24);
  const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
  return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
}

function computeCompletedPatterns(
  matrix: number[], drawnSet: Set<number>, patterns: Pattern[]
): Pattern[] {
  const grid = buildGrid(matrix);
  const isCellMarked = (i: number) => {
    const val = grid[Math.floor(i / 5)][i % 5];
    return val === null || drawnSet.has(val as number);
  };
  return patterns.filter(p =>
    p.cells.every((req, i) => !req || isCellMarked(i))
  );
}

export function useReplay(gameId: string, session: Session): ReplayState {
  const [game, setGame] = useState<BlockchainGameState | null>(null);
  const [tickets, setTickets] = useState<Array<{ id: string; matrix: number[]; pricePaid?: string }>>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [revealedCount, setRevealedCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [patterns,      setPatterns]      = useState<Pattern[]>([]);
  const [combinations,  setCombinations]  = useState<CombinationRuleInput[]>([]);
  const [extendedRules, setExtendedRules] = useState<ExtendedRule[]>([]);
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
          // Busca patterns e combinações deste gametype
          try {
            const [pats, meta] = await Promise.all([
              fetchGamePatterns(session, gametypeId),
              fetchPublicGametypeMetadata(gametypeId),
            ]);
            if (!cancelled) {
              if (pats.length)              setPatterns(pats);
              if (meta.combinations?.length) setCombinations(meta.combinations);
              if (meta.rules?.length)        setExtendedRules(meta.rules);
            }
          } catch { /* patterns/combos indisponíveis */ }
        }
        if (!cancelled) setGame({ ...g, _maxBalls: maxBalls } as any);

        setTickets(
          (ticketsRes.rows as Array<BlockchainTicketRecord & { matrix: number[] | string }>).map(r => ({
            id:        r.ticket_id,
            matrix:    Array.isArray(r.matrix) ? r.matrix : parseHexBytes(r.matrix as string),
            pricePaid: r.price?.quantity,
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

  // Computa winners localmente — quantas cartelas completaram cada padrão
  // com base no conjunto completo de bolas sorteadas.
  const fullDrawnSet = useMemo(() => new Set(fullDrawnBalls), [fullDrawnBalls]);

  const winners = useMemo(() => {
    if (!tickets.length || !patterns.length) return [];
    return tickets.map(t => ({
      ticket_id: t.id,
      patterns: computeCompletedPatterns(t.matrix, fullDrawnSet, patterns),
    })).filter(w => w.patterns.length > 0);
  }, [tickets, patterns, fullDrawnSet]);

  const patternWinCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of winners) {
      for (const p of w.patterns) {
        count.set(p.name, (count.get(p.name) || 0) + 1);
      }
    }
    return count;
  }, [winners]);

  // mapa patternId → nome e nome → tipo — usa p.id para não depender de ordem
  const { patternNameById, patternTypeByName } = useMemo(() => {
    const byId   = new Map<string, string>();
    const byType = new Map<string, string>();
    for (const p of patterns) {
      if (p.id) byId.set(p.id, p.name);
      const r = extendedRules.find(r => r.pattern_id === p.id);
      if (r) byType.set(p.name, r.type);
    }
    return { patternNameById: byId, patternTypeByName: byType };
  }, [patterns, extendedRules]);

  // quantas cartelas completaram cada combinação nomeada
  const combinationWinCount = useMemo(() => {
    if (!combinations.length || !tickets.length) return new Map<string, number>();
    const count = new Map<string, number>();
    for (const ticket of tickets) {
      const grid = buildGrid(ticket.matrix);
      const flat: (number | null)[] = [];
      for (let r = 0; r < 5; r++) flat.push(grid[r][0], grid[r][1], grid[r][2], grid[r][3], grid[r][4]);

      const completedSet = new Set<string>();
      for (const p of patterns) {
        const done = p.cells.every((req, i) => {
          if (!req) return true;
          const val = flat[i];
          return val === null || fullDrawnSet.has(val as number);
        });
        if (done) {
          completedSet.add(p.name);
          // aceita também por id para cláusulas que guardam id
          for (const [id, name] of patternNameById) {
            if (name === p.name) completedSet.add(id);
          }
        }
      }

      for (const combo of combinations) {
        if (isCombinationSatisfied(combo, completedSet, patternTypeByName)) {
          count.set(combo.name, (count.get(combo.name) || 0) + 1);
        }
      }
    }
    return count;
  }, [combinations, tickets, patterns, fullDrawnSet, patternNameById, patternTypeByName]);

  const goldenBall = useMemo(() => {
    if (!game) return null;
    const num = game.golden_ball_num;
    const mult = game.golden_multiplier;
    if (num && num > 0 && mult && mult > 0) {
      return { ballNum: num, multiplier: mult };
    }
    return null;
  }, [game]);

  const gameEnded = game
    ? ['drawn', 'paying', 'archived', 'aborted'].includes(game.status)
    : false;

  return {
    game, tickets,
    fullDrawnBalls, revealedBalls, revealedCount, totalBalls,
    isPlaying, isComplete, isLoading,
    speed, setSpeed, togglePlay, skipToEnd, restart,
    patterns, combinations, patternWinCount, combinationWinCount, winners,
    goldenBall, gameEnded,
  };
}
