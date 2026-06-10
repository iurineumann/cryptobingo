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

// ==========================================
// COMPOSITE SCORE FOR TICKET SORTING
// ==========================================

export interface WinnerInfo {
  prize: string;
  patternName: string;
  totalPrize: number;
  patternCount: number;
}

export interface TicketEntry {
  id:         string;
  matrix:     number[];
  pricePaid?: string;  // quantity string ADR-010, ex: "5.0000 BINGO"
}

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

export interface TicketScore {
  completedScore: number;
  proximityScore: number;
  markedCells: number;
}

export function computeTicketCompositeScore(
  matrix: number[],
  drawnSet: Set<number>,
  patterns: Pattern[],
): TicketScore {
  const flat = ticketFlat(matrix);
  let completedScore = 0;
  let proximityScore = 0;
  let markedCells = 0;

  for (let i = 0; i < 24; i++) {
    if (drawnSet.has(matrix[i])) markedCells++;
  }

  for (const p of patterns) {
    const prizeVal = parseFloat(p.prize) || 0;
    const totalReq = p.cells.filter(Boolean).length;
    if (totalReq === 0) continue;

    let marked = 0;
    for (let i = 0; i < 25; i++) {
      if (!p.cells[i]) continue;
      if (i === 12 || (flat[i] !== null && drawnSet.has(flat[i] as number))) {
        marked++;
      }
    }

    if (marked >= totalReq) {
      completedScore += prizeVal;
    } else {
      proximityScore += (marked / totalReq) * prizeVal;
    }
  }

  return { completedScore, proximityScore, markedCells };
}

function ticketCompositeSortKey(score: TicketScore): number {
  return score.completedScore * 1_000_000_000 + score.proximityScore * 1_000_000 + score.markedCells;
}

export function sortTickets(
  tickets: TicketEntry[],
  drawnSet: Set<number>,
  patterns: Pattern[],
  winnerMap: Map<string, WinnerInfo>,
  _drawnCount?: number,
  _maxBalls?: number,
): TicketEntry[] {
  if (tickets.length === 0) return tickets;

  const scoreCache = new Map<string, number>();
  for (const t of tickets) {
    const score = computeTicketCompositeScore(t.matrix, drawnSet, patterns);
    scoreCache.set(t.id, ticketCompositeSortKey(score));
  }

  return [...tickets].sort((a, b) => {
    const wA = winnerMap.get(a.id);
    const wB = winnerMap.get(b.id);
    if (wA && !wB) return -1;
    if (!wA && wB) return 1;
    if (wA && wB) {
      if (wA.totalPrize !== wB.totalPrize) return wB.totalPrize - wA.totalPrize;
      if (wA.patternCount !== wB.patternCount) return wB.patternCount - wA.patternCount;
    }
    const kA = scoreCache.get(a.id)!;
    const kB = scoreCache.get(b.id)!;
    if (kA !== kB) return kB - kA;
    return a.id.localeCompare(b.id);
  });
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
): GroupedTickets[] {
  const multiWinners: TicketEntry[] = [];
  const singleWinners: TicketEntry[] = [];
  const others: TicketEntry[] = [];
  for (const t of tickets) {
    const w = winnerMap.get(t.id);
    if (!w) others.push(t);
    else if (w.patternCount > 1) multiWinners.push(t);
    else singleWinners.push(t);
  }

  const sortByComposite = (ts: TicketEntry[]) => {
    const cache = new Map<string, number>();
    for (const t of ts) {
      const score = computeTicketCompositeScore(t.matrix, drawnSet, patterns);
      cache.set(t.id, ticketCompositeSortKey(score));
    }
    ts.sort((a, b) => {
      const kA = cache.get(a.id)!;
      const kB = cache.get(b.id)!;
      if (kA !== kB) return kB - kA;
      return a.id.localeCompare(b.id);
    });
  };

  sortByComposite(multiWinners);
  sortByComposite(singleWinners);

  const groups: GroupedTickets[] = [];
  if (multiWinners.length > 0)
    groups.push({ category: 'multi-winner', label: 'Multi-Winners', icon: '🏆', tickets: multiWinners });
  if (singleWinners.length > 0)
    groups.push({ category: 'single-winner', label: 'Winners', icon: '🥇', tickets: singleWinners });

  const scoreCache = new Map<string, { key: number; bestPattern: string }>();
  for (const t of others) {
    const score = computeTicketCompositeScore(t.matrix, drawnSet, patterns);
    const key = ticketCompositeSortKey(score);

    let bestPattern = '';
    let bestProximity = 0;
    for (const p of patterns) {
      const prizeVal = parseFloat(p.prize) || 0;
      const totalReq = p.cells.filter(Boolean).length;
      if (totalReq === 0) continue;
      const flat = ticketFlat(t.matrix);
      let marked = 0;
      for (let i = 0; i < 25; i++) {
        if (!p.cells[i]) continue;
        if (i === 12 || (flat[i] !== null && drawnSet.has(flat[i] as number))) marked++;
      }
      const prox = marked < totalReq ? (marked / totalReq) * prizeVal : 0;
      if (prox > bestProximity) {
        bestProximity = prox;
        bestPattern = p.name;
      }
    }
    scoreCache.set(t.id, { key, bestPattern: bestPattern || '__none__' });
  }

  const patternGroups = new Map<string, TicketEntry[]>();
  for (const t of others) {
    const entry = scoreCache.get(t.id)!;
    if (!patternGroups.has(entry.bestPattern)) patternGroups.set(entry.bestPattern, []);
    patternGroups.get(entry.bestPattern)!.push(t);
  }

  const groupEntries = [...patternGroups.entries()]
    .filter(([k]) => k !== '__none__')
    .sort(([, aTickets], [, bTickets]) => {
      const aBest = aTickets.reduce((max, t) => Math.max(max, scoreCache.get(t.id)!.key), 0);
      const bBest = bTickets.reduce((max, t) => Math.max(max, scoreCache.get(t.id)!.key), 0);
      return bBest - aBest;
    })
    .map(([name, ts]) => {
      ts.sort((a, b) => {
        const kA = scoreCache.get(a.id)!.key;
        const kB = scoreCache.get(b.id)!.key;
        if (kA !== kB) return kB - kA;
        return a.id.localeCompare(b.id);
      });
      return { category: `pattern:${name}`, label: name, icon: '🎲', tickets: ts };
    });
  groups.push(...groupEntries);

  const noneTickets = patternGroups.get('__none__');
  if (noneTickets && noneTickets.length > 0) {
    noneTickets.sort((a, b) => {
      const kA = scoreCache.get(a.id)!.key;
      const kB = scoreCache.get(b.id)!.key;
      if (kA !== kB) return kB - kA;
      return a.id.localeCompare(b.id);
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
      return (clause.pattern_ids ?? []).every(id => completedNames.has(String(id)));
    }
    if (clause.type === 'any_of') {
      return (clause.pattern_ids ?? []).some(id => completedNames.has(String(id)));
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

// ── Utilitários de combinação ─────────────────────────────────────────────────

/**
 * Retorna o mapa de células (union) de uma combinação, compondo os padrões
 * membros ordenados por pattern_id para coerência visual entre clientes.
 */
export function getCombinationCells(
  combo:          CombinationRuleInput,
  gamePatterns:   Pattern[],
  extendedRules:  ExtendedRule[],
  patternNameById: Map<string, string>,
): number[] {
  const cells = new Array<number>(25).fill(0);
  for (const clause of combo.clauses) {
    let ids: string[] = [];
    if (clause.type === 'all_of') {
      ids = clause.pattern_ids ?? [];
    } else if (clause.type === 'n_of_type') {
      const type   = clause.pattern_type ?? 'simple';
      const needed = clause.count ?? 1;
      ids = extendedRules
        .filter(r => r.type === type)
        .sort((a, b) => Number(a.pattern_id) - Number(b.pattern_id))
        .slice(0, needed)
        .map(r => r.pattern_id);
    } else if (clause.type === 'any_of') {
      ids = (clause.pattern_ids ?? []).slice(0, 1);
    }
    for (const id of ids) {
      const name = patternNameById.get(id);
      const p    = gamePatterns.find(gp => gp.id === id || gp.name === name);
      if (p) p.cells.forEach((on, i) => { if (on) cells[i] = 1; });
    }
  }
  return cells;
}

/**
 * Retorna a % de completude (0–1) da melhor cartela do jogador para
 * a combinação dada. Usa lógica AND entre cláusulas (minimum).
 */
export function computeCombinationProximity(
  combo:             CombinationRuleInput,
  tickets:           TicketEntry[],
  drawnSet:          Set<number>,
  gamePatterns:      Pattern[],
  patternNameById:   Map<string, string>,
  patternTypeByName: Map<string, string>,
): number {
  if (!tickets.length) return 0;
  let best = 0;
  for (const ticket of tickets) {
    const flat = ticketFlat(ticket.matrix);
    const done = new Set<string>(
      gamePatterns
        .filter(p => p.cells.every((req, i) => !req || flat[i] === null || drawnSet.has(flat[i] as number)))
        .map(p => p.name),
    );
    const doneWithIds = new Set<string>(done);
    for (const [id, name] of patternNameById) {
      if (done.has(name)) doneWithIds.add(id);
    }
    // Proximidade = min das cláusulas (AND)
    let minClause = 1;
    for (const clause of combo.clauses) {
      let clausePct = 0;
      if (clause.type === 'all_of') {
        const ids    = (clause.pattern_ids ?? []).map(id => String(id));
        if (!ids.length) { clausePct = 1; }
        else clausePct = ids.filter(id => doneWithIds.has(id)).length / ids.length;
      } else if (clause.type === 'n_of_type') {
        const type   = clause.pattern_type ?? 'simple';
        const needed = clause.count ?? 1;
        const got    = [...done].filter(n => patternTypeByName.get(n) === type).length;
        clausePct    = Math.min(1, got / needed);
      } else if (clause.type === 'any_of') {
        clausePct = (clause.pattern_ids ?? []).some(id => doneWithIds.has(String(id))) ? 1 : 0;
      }
      if (clausePct < minClause) minClause = clausePct;
    }
    if (minClause > best) best = minClause;
  }
  return best;
}

/**
 * Para uma cartela que completou wonPatternNames, retorna as combinações
 * satisfeitas e quais padrões são "subsumed" (absorvidos) por cada uma.
 */
export function detectComboWinsForTicket(
  wonPatternNames:   string[],
  gameCombinations:  CombinationRuleInput[],
  patternTypeByName: Map<string, string>,
  patternNameById:   Map<string, string>,
): Array<{ comboName: string; subsumedPatterns: string[] }> {
  const wonSet = new Set(wonPatternNames);
  const wonWithIds = new Set<string>(wonSet);
  for (const [id, name] of patternNameById) {
    if (wonSet.has(name)) wonWithIds.add(id);
  }
  const result: Array<{ comboName: string; subsumedPatterns: string[] }> = [];
  for (const combo of gameCombinations) {
    if (!isCombinationSatisfied(combo, wonWithIds, patternTypeByName)) continue;
    const subsumed: string[] = [];
    for (const clause of combo.clauses) {
      if (clause.type === 'all_of') {
        for (const id of clause.pattern_ids ?? []) {
          const name = patternNameById.get(String(id)) ?? String(id);
          if (wonSet.has(name)) subsumed.push(name);
        }
      } else if (clause.type === 'n_of_type') {
        const type   = clause.pattern_type ?? 'simple';
        const needed = clause.count ?? 1;
        let   count  = 0;
        for (const n of wonPatternNames) {
          if (patternTypeByName.get(n) === type && count < needed) { subsumed.push(n); count++; }
        }
      } else if (clause.type === 'any_of') {
        for (const id of clause.pattern_ids ?? []) {
          const name = patternNameById.get(String(id)) ?? String(id);
          if (wonSet.has(name)) { subsumed.push(name); break; }
        }
      }
    }
    result.push({ comboName: combo.name, subsumedPatterns: subsumed });
  }

  // Resolve sobreposição entre combinações satisfeitas: paga apenas a de MAIOR peso
  // quando elas compartilham padrões. Combinações aninhadas (ex.: "2 Simples" ⊂
  // "6 Simples") são absorvidas — só a maior conta. Combinações independentes
  // (que consomem padrões distintos) permanecem todas.
  const weightByName = new Map(gameCombinations.map(c => [c.name, c.weight]));
  result.sort((a, b) => (weightByName.get(b.comboName) ?? 0) - (weightByName.get(a.comboName) ?? 0));
  const consumed = new Set<string>();
  const resolved: Array<{ comboName: string; subsumedPatterns: string[] }> = [];
  for (const r of result) {
    // mantém apenas se contribui com ao menos um padrão ainda não consumido
    if (!r.subsumedPatterns.some(p => !consumed.has(p))) continue;
    for (const p of r.subsumedPatterns) consumed.add(p);
    resolved.push(r);
  }
  return resolved;
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
