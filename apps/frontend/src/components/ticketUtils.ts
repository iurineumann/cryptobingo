// apps/frontend/src/components/ticketUtils.ts
// Utilitários, tipos e funções assíncronas do sistema de cartelas BINGO.
// Separado de TicketCard.tsx para compatibilidade com o Fast Refresh do Vite.

import { Session } from '@wharfkit/session';
import { UInt64 }  from '@wharfkit/antelope';
import type { CombinationRuleInput, CombinationClauseInput, ExtendedRule } from '../services/api';

export type { CombinationRuleInput, CombinationClauseInput, ExtendedRule };

// ==========================================
// CONSTANTES
// ==========================================

export const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)',
  I: 'var(--color-bingo-i)',
  N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)',
  O: 'var(--color-bingo-o)',
};

export const COLS = ['B', 'I', 'N', 'G', 'O'];

export function getCol(n: number): string {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

// ==========================================
// HELPERS
// ==========================================

export interface Pattern {
  id?:   string;   // ID blockchain do padrão — preenchido por fetchGamePatterns
  name:  string;
  prize: string;
  cells: number[]; // 25 elementos row-major (0|1); índice 12 = FREE SPACE
}

export function maskToCells(mask: number): number[] {
  // Contrato armazena o mask em ordem coluna-maior (bit 0 = B0, bit 1 = B1, ..., bit 5 = I0, ...)
  // Convertemos para linha-maior (index 0 = B0, index 1 = I0, ..., index 5 = B1, ...)
  const result = new Array<number>(25).fill(0);
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      const colMajorBit = col * 5 + row;
      const rowMajorIdx = row * 5 + col;
      result[rowMajorIdx] = (mask >> colMajorBit) & 1;
    }
  }
  return result;
}

export function weightToPrize(weight: number): string {
  return (weight / 100).toFixed(2);
}

export function computeProximityScore(matrix: number[], drawnSet: Set<number>, patterns: Pattern[]): number {
  const B    = matrix.slice(0, 5);
  const I    = matrix.slice(5, 10);
  const Nraw = matrix.slice(10, 14);
  const G    = matrix.slice(14, 19);
  const O    = matrix.slice(19, 24);
  const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
  const flat: (number | null)[] = [];
  for (let r = 0; r < 5; r++) flat.push(B[r], I[r], N[r], G[r], O[r]);

  let score = 0;
  for (const p of patterns) {
    const totalReq = p.cells.filter(Boolean).length;
    if (totalReq === 0) continue;
    const markedReq = p.cells.filter((req, i) => {
      if (!req) return false;
      return flat[i] === null || drawnSet.has(flat[i] as number);
    }).length;
    const prizeVal = parseFloat(p.prize) || 0;
    score += (markedReq / totalReq) * prizeVal;
  }
  return score;
}

// ==========================================
// SORT / GROUP UTILITIES
// ==========================================

export type GamePhase = 'during' | 'after';

export interface WinnerInfo {
  prize: string;
  patternName: string;
  totalPrize: number;
  patternCount: number;
}

export interface TicketEntry {
  id: string;
  matrix: number[];
}

// ── Ticket flat helper ──

function ticketFlat(matrix: number[]): (number | null)[] {
  const B    = matrix.slice(0, 5);
  const I    = matrix.slice(5, 10);
  const Nraw = matrix.slice(10, 14);
  const G    = matrix.slice(14, 19);
  const O    = matrix.slice(19, 24);
  const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
  const flat: (number | null)[] = [];
  for (let r = 0; r < 5; r++) flat.push(B[r], I[r], N[r], G[r], O[r]);
  return flat;
}

// ── Metrics ──

interface PatternMetrics {
  completionPct: number;
  weightedScore: number;
  cellsRemaining: number;
}

function computePatternMetrics(matrix: number[], drawnSet: Set<number>, pattern: Pattern): PatternMetrics {
  const flat = ticketFlat(matrix);
  const totalReq = pattern.cells.filter(Boolean).length;
  const cellsMissing = pattern.cells
    .map((req, i) => ({ req, val: flat[i] }))
    .filter(c => c.req && c.val !== null && !drawnSet.has(c.val as number));
  const marked = totalReq - cellsMissing.length;
  const pct = totalReq > 0 ? marked / totalReq : 0;
  const prizeVal = parseFloat(pattern.prize) || 0;
  return { completionPct: pct, weightedScore: pct * prizeVal, cellsRemaining: cellsMissing.length };
}

interface TicketCombinationMetrics {
  bestPattern: string;
  combinedScore: number;
  nearCompleteCount: number;
  patternAffinities: Map<string, PatternMetrics>;
}

function computeCombinationMetrics(matrix: number[], drawnSet: Set<number>, patterns: Pattern[]): TicketCombinationMetrics {
  const affinities = new Map<string, PatternMetrics>();
  let combinedScore = 0;
  let nearCompleteCount = 0;
  let bestPattern = '';
  let bestWeighted = -1;

  for (const p of patterns) {
    const m = computePatternMetrics(matrix, drawnSet, p);
    affinities.set(p.name, m);
    combinedScore += m.weightedScore;
    if (m.cellsRemaining <= 2 && m.cellsRemaining > 0) nearCompleteCount++;
    if (m.weightedScore > bestWeighted) {
      bestWeighted = m.weightedScore;
      bestPattern = m.weightedScore > 0 || m.completionPct >= 1 / 25 ? p.name : '';
    }
  }
  return { bestPattern, combinedScore, nearCompleteCount, patternAffinities: affinities };
}

// ── Sort durante a partida ──

function sortDuringGame(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patterns: Pattern[],
  winnerMap: Map<string, WinnerInfo>,
): TicketEntry[] {
  const multiWinners: TicketEntry[] = [];
  const singleWinners: TicketEntry[] = [];
  const others: TicketEntry[] = [];
  for (const t of tickets) {
    const w = winnerMap.get(t.id);
    if (!w) others.push(t);
    else if (w.patternCount > 1) multiWinners.push(t);
    else singleWinners.push(t);
  }
  multiWinners.sort((a, b) => {
    const pA = winnerMap.get(a.id)?.totalPrize ?? 0;
    const pB = winnerMap.get(b.id)?.totalPrize ?? 0;
    if (pA !== pB) return pB - pA;
    const cA = winnerMap.get(a.id)?.patternCount ?? 0;
    const cB = winnerMap.get(b.id)?.patternCount ?? 0;
    return cB - cA;
  });
  singleWinners.sort((a, b) => {
    const pA = parseFloat(winnerMap.get(a.id)?.prize || '0') || 0;
    const pB = parseFloat(winnerMap.get(b.id)?.prize || '0') || 0;
    return pB - pA;
  });

  const metricsCache = new Map<string, TicketCombinationMetrics>();
  for (const t of others) {
    metricsCache.set(t.id, computeCombinationMetrics(t.matrix, drawnSet, patterns));
  }

  const patternGroups = new Map<string, { tickets: TicketEntry[]; bestCombined: number }>();
  for (const t of others) {
    const m = metricsCache.get(t.id)!;
    const key = m.bestPattern || '__none__';
    let g = patternGroups.get(key);
    if (!g) { g = { tickets: [], bestCombined: 0 }; patternGroups.set(key, g); }
    g.tickets.push(t);
    if (m.combinedScore > g.bestCombined) g.bestCombined = m.combinedScore;
  }

  const sortedGroups = [...patternGroups.entries()]
    .filter(([key]) => key !== '__none__')
    .sort(([, a], [, b]) => b.bestCombined - a.bestCombined);

  const noneGroup = patternGroups.get('__none__');
  const result = [...multiWinners, ...singleWinners];
  for (const [, group] of sortedGroups) {
    group.tickets.sort((a, b) => {
      const mA = metricsCache.get(a.id)!;
      const mB = metricsCache.get(b.id)!;
      if (mA.combinedScore !== mB.combinedScore) return mB.combinedScore - mA.combinedScore;
      if (mA.nearCompleteCount !== mB.nearCompleteCount) return mB.nearCompleteCount - mA.nearCompleteCount;
      const mAcount = a.matrix.filter(n => drawnSet.has(n)).length + 1;
      const mBcount = b.matrix.filter(n => drawnSet.has(n)).length + 1;
      return mBcount - mAcount;
    });
    result.push(...group.tickets);
  }
  if (noneGroup) {
    noneGroup.tickets.sort((a, b) => {
      const m = metricsCache.get(a.id)!;
      const n = metricsCache.get(b.id)!;
      if (m.combinedScore !== n.combinedScore) return n.combinedScore - m.combinedScore;
      const mAcount = a.matrix.filter(n => drawnSet.has(n)).length + 1;
      const mBcount = b.matrix.filter(n => drawnSet.has(n)).length + 1;
      return mBcount - mAcount;
    });
    result.push(...noneGroup.tickets);
  }
  return result;
}

// ── Sort após o encerramento ──

function sortAfterGame(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patterns: Pattern[],
  winnerMap: Map<string, WinnerInfo>,
): TicketEntry[] {
  if (tickets.length === 0) return tickets;
  return [...tickets].sort((a, b) => {
    const wA = winnerMap.get(a.id);
    const wB = winnerMap.get(b.id);
    if (wA && !wB) return -1;
    if (!wA && wB) return 1;
    if (wA && wB) {
      if (wA.patternCount !== wB.patternCount) return wB.patternCount - wA.patternCount;
      if (wA.totalPrize !== wB.totalPrize) return wB.totalPrize - wA.totalPrize;
    }
    const proxA = computeProximityScore(a.matrix, drawnSet, patterns);
    const proxB = computeProximityScore(b.matrix, drawnSet, patterns);
    if (proxA !== proxB) return proxB - proxA;
    const mA = a.matrix.filter(n => drawnSet.has(n)).length + 1;
    const mB = b.matrix.filter(n => drawnSet.has(n)).length + 1;
    if (mA !== mB) return mB - mA;
    return a.id.localeCompare(b.id);
  });
}

export function sortTickets(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patterns: Pattern[],
  winnerMap: Map<string, WinnerInfo>,
  _drawnCount: number,
  _maxBalls: number,
  phase: GamePhase = 'after',
): TicketEntry[] {
  if (tickets.length === 0) return tickets;
  if (phase === 'during') return sortDuringGame(tickets, drawnSet, patterns, winnerMap);
  return sortAfterGame(tickets, drawnSet, patterns, winnerMap);
}

export interface GroupedTickets {
  category: string;
  label: string;
  icon: string;
  tickets: TicketEntry[];
}

export function groupTicketsByCategory(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patterns: Pattern[],
  winnerMap: Map<string, WinnerInfo>,
  _drawnCount: number,
  _maxBalls: number,
  phase: GamePhase = 'after',
): GroupedTickets[] {
  if (phase !== 'during') {
    if (tickets.length === 0) return [];
    const sorted = sortAfterGame(tickets, drawnSet, patterns, winnerMap);
    return [{ category: 'all', label: 'Tickets', icon: '🎯', tickets: sorted }];
  }

  const multiWinners: TicketEntry[] = [];
  const singleWinners: TicketEntry[] = [];
  const others: TicketEntry[] = [];
  for (const t of tickets) {
    const w = winnerMap.get(t.id);
    if (!w) others.push(t);
    else if (w.patternCount > 1) multiWinners.push(t);
    else singleWinners.push(t);
  }
  multiWinners.sort((a, b) => {
    const pA = winnerMap.get(a.id)?.totalPrize ?? 0;
    const pB = winnerMap.get(b.id)?.totalPrize ?? 0;
    if (pA !== pB) return pB - pA;
    const cA = winnerMap.get(a.id)?.patternCount ?? 0;
    const cB = winnerMap.get(b.id)?.patternCount ?? 0;
    return cB - cA;
  });
  singleWinners.sort((a, b) => {
    const pA = parseFloat(winnerMap.get(a.id)?.prize || '0') || 0;
    const pB = parseFloat(winnerMap.get(b.id)?.prize || '0') || 0;
    return pB - pA;
  });

  const groups: GroupedTickets[] = [];
  if (multiWinners.length > 0)
    groups.push({ category: 'multi-winner', label: 'Multi-Winners', icon: '🏆', tickets: multiWinners });
  if (singleWinners.length > 0)
    groups.push({ category: 'single-winner', label: 'Winners', icon: '🥇', tickets: singleWinners });

  const metricsCache = new Map<string, TicketCombinationMetrics>();
  for (const t of others) metricsCache.set(t.id, computeCombinationMetrics(t.matrix, drawnSet, patterns));

  const patternGroups = new Map<string, TicketEntry[]>();
  for (const t of others) {
    const m = metricsCache.get(t.id)!;
    const key = m.bestPattern || '__none__';
    if (!patternGroups.has(key)) patternGroups.set(key, []);
    patternGroups.get(key)!.push(t);
  }

  const groupEntries = [...patternGroups.entries()]
    .filter(([k]) => k !== '__none__')
    .sort(([, aTickets], [, bTickets]) => {
      const aBest = aTickets.reduce((max, t) => Math.max(max, metricsCache.get(t.id)!.combinedScore), 0);
      const bBest = bTickets.reduce((max, t) => Math.max(max, metricsCache.get(t.id)!.combinedScore), 0);
      return bBest - aBest;
    })
    .map(([name, ts]) => {
      ts.sort((a, b) => {
        const mA = metricsCache.get(a.id)!;
        const mB = metricsCache.get(b.id)!;
        if (mA.combinedScore !== mB.combinedScore) return mB.combinedScore - mA.combinedScore;
        if (mA.nearCompleteCount !== mB.nearCompleteCount) return mB.nearCompleteCount - mA.nearCompleteCount;
        const aMarked = a.matrix.filter(n => drawnSet.has(n)).length + 1;
        const bMarked = b.matrix.filter(n => drawnSet.has(n)).length + 1;
        return bMarked - aMarked;
      });
      return { category: `pattern:${name}`, label: name, icon: '🎲', tickets: ts };
    });
  groups.push(...groupEntries);

  const noneTickets = patternGroups.get('__none__');
  if (noneTickets && noneTickets.length > 0) {
    noneTickets.sort((a, b) => {
      const mA = metricsCache.get(a.id)!;
      const mB = metricsCache.get(b.id)!;
      if (mA.combinedScore !== mB.combinedScore) return mB.combinedScore - mA.combinedScore;
      const aMarked = a.matrix.filter(n => drawnSet.has(n)).length + 1;
      const bMarked = b.matrix.filter(n => drawnSet.has(n)).length + 1;
      return bMarked - aMarked;
    });
    groups.push({ category: 'none', label: 'Other', icon: '📋', tickets: noneTickets });
  }
  return groups;
}

export function computePatternUserProximity(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  pattern: Pattern,
): { maxCompletionPct: number; weightedScore: number } {
  const totalReq = pattern.cells.filter(Boolean).length;
  if (totalReq === 0) return { maxCompletionPct: 0, weightedScore: 0 };

  let maxCompletion = 0;
  let bestWeighted = 0;
  const prizeVal = parseFloat(pattern.prize) || 0;

  for (const t of tickets) {
    const flat = ticketFlat(t.matrix);
    const marked = pattern.cells.filter((req, i) => {
      if (!req) return false;
      return flat[i] === null || drawnSet.has(flat[i] as number);
    }).length;
    const pct = marked / totalReq;
    if (pct > maxCompletion) maxCompletion = pct;
    const weighted = (marked / totalReq) * prizeVal;
    if (weighted > bestWeighted) bestWeighted = weighted;
  }
  return { maxCompletionPct: maxCompletion, weightedScore: bestWeighted };
}

export type PatternCategory = 'completed' | 'progress' | 'pending';

export function getPatternCategory(
  pattern: Pattern,
  patternWinCount: Map<string, number>,
  userProximity: { maxCompletionPct: number },
): PatternCategory {
  const wins = patternWinCount.get(pattern.name) || 0;
  if (wins > 0) return 'completed';
  if (userProximity.maxCompletionPct > 0) return 'progress';
  return 'pending';
}

export interface GroupedPatterns {
  category: PatternCategory;
  label: string;
  icon: string;
  patterns: Pattern[];
}

export function groupPatternsByCategory(
  patterns: Pattern[],
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patternWinCount: Map<string, number>,
): GroupedPatterns[] {
  const pProx = new Map<string, { maxCompletionPct: number; weightedScore: number }>();
  for (const p of patterns) {
    pProx.set(p.name, computePatternUserProximity(tickets, drawnSet, p));
  }
  const groups: Record<PatternCategory, Pattern[]> = { completed: [], progress: [], pending: [] };
  for (const p of patterns) {
    const prox = pProx.get(p.name)!;
    const cat = getPatternCategory(p, patternWinCount, prox);
    groups[cat].push(p);
  }
  const result: GroupedPatterns[] = [
    { category: 'completed', label: 'Completed', icon: '✅', patterns: groups.completed },
    { category: 'progress',  label: 'In Progress', icon: '📈', patterns: groups.progress },
    { category: 'pending',   label: 'Others',      icon: '📋', patterns: groups.pending },
  ];
  return result.filter(g => g.patterns.length > 0);
}

export function sortPatterns(
  patterns: Pattern[],
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patternWinCount: Map<string, number>,
): Pattern[] {
  if (patterns.length === 0) return patterns;

  const pProx = new Map<string, { maxCompletionPct: number; weightedScore: number }>();
  for (const p of patterns) {
    pProx.set(p.name, computePatternUserProximity(tickets, drawnSet, p));
  }

  return [...patterns].sort((a, b) => {
    const proxA = pProx.get(a.name)!;
    const proxB = pProx.get(b.name)!;
    const catA = getPatternCategory(a, patternWinCount, proxA);
    const catB = getPatternCategory(b, patternWinCount, proxB);
    const order = { completed: 0, progress: 1, pending: 2 };
    const catDiff = order[catA] - order[catB];
    if (catDiff !== 0) return catDiff;

    if (catA === 'completed') {
      const wA = patternWinCount.get(a.name) || 0;
      const wB = patternWinCount.get(b.name) || 0;
      if (wA !== wB) return wB - wA;
    }

    if (catA === 'progress') {
      if (proxA.maxCompletionPct !== proxB.maxCompletionPct) {
        return proxB.maxCompletionPct - proxA.maxCompletionPct;
      }
      if (proxA.weightedScore !== proxB.weightedScore) {
        return proxB.weightedScore - proxA.weightedScore;
      }
    }

    const pA = parseFloat(a.prize) || 0;
    const pB = parseFloat(b.prize) || 0;
    if (pA !== pB) return pB - pA;
    return a.name.localeCompare(b.name);
  });
}

export function isCombinationSatisfied(
  combination:       CombinationRuleInput,
  completedNames:    Set<string>,
  patternTypeByName: Map<string, string>,
): boolean {
  return combination.clauses.every(clause => {
    if (clause.type === 'all_of') {
      return (clause.pattern_ids ?? []).every(id => completedNames.has(id));
    }
    if (clause.type === 'any_of') {
      return (clause.pattern_ids ?? []).some(id => completedNames.has(id));
    }
    if (clause.type === 'n_of_type') {
      const needed = clause.count ?? 1;
      const type   = clause.pattern_type ?? 'simple';
      let count    = 0;
      for (const name of completedNames) {
        if (patternTypeByName.get(name) === type) count++;
      }
      return count >= needed;
    }
    return false;
  });
}

export async function fetchGamePatterns(session: Session, gametypeId: string): Promise<Pattern[]> {
  const c = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
  try {
    const gtRes = await session.client.v1.chain.get_table_rows({
      code: c, scope: c, table: 'gametypes',
      lower_bound: UInt64.from(gametypeId),
      upper_bound: UInt64.from(gametypeId),
      limit: 1, json: true,
    });
    if (!gtRes.rows.length) return [];
    const gametype = gtRes.rows[0] as any;
    const rules: Array<{ pattern_id: string | number; weight: number }> = gametype.rules ?? [];
    if (!rules.length) return [];

    const results: Pattern[] = [];
    for (const rule of rules) {
      const patRes = await session.client.v1.chain.get_table_rows({
        code: c, scope: c, table: 'patterns',
        lower_bound: UInt64.from(String(rule.pattern_id)),
        upper_bound: UInt64.from(String(rule.pattern_id)),
        limit: 1, json: true,
      });
      if (patRes.rows.length) {
        const pat = patRes.rows[0] as any;
        results.push({
          id:    String(rule.pattern_id),
          name:  pat.name,
          prize: weightToPrize(rule.weight),
          cells: maskToCells(Number(pat.mask)),
        });
      }
    }
    return results;
  } catch {
    return [];
  }
}
