// apps/frontend/src/components/gameroom/useGameRoomState.ts
// Hook de estado da Sala de Jogo — concentra estado, efeitos e TODAS as derivações
// (padrões/combinações/proximidade/payouts) que antes viviam no corpo da GameRoom.
//
// Movido verbatim da GameRoom.tsx na Fase 0 do refactor (ADR-005/010/016 — lógica
// econômica preservada idêntica). O orquestrador consome este hook e mantém o JSX.
//
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { BlockchainGameState, BlockchainBalance, ExtendedAsset } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../../services/api';
import { useSlowReveal } from '../../hooks/useSlowReveal';
import type { DrawnBall, GoldenBallInfo, GoldenMultiplierProgress, ClearedStage } from '../../hooks/useSlowReveal';
import type { WinnerPayload } from '../../types/events';
import type { StageRule } from '../../services/api';
import {
  Pattern, BINGO_COLORS, getCol,
  fetchGamePatterns, sortPatterns,
  groupTicketsByCategory, isCombinationSatisfied,
  computePatternUserProximity,
  getCombinationCells, computeCombinationProximity, detectComboWinsForTicket,
  buildPatternTypeMaps,
  type CombinationRuleInput, type ExtendedRule,
} from '../ticketUtils';
import { fetchPublicGametypeMetadata, fetchGamePrizeTransactions } from '../../services/api';
import { trackEvent } from '~/services/analytics';

function parseHexMatrix(hex: string): number[] {
  const bytes: number[] = [];
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  for (let i = 0; i < raw.length; i += 2) {
    bytes.push(parseInt(raw.substring(i, i + 2), 16));
  }
  return bytes;
}

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';

// constantes de apresentação reusadas pelo header/stage
export const STATUS_DOT: Record<string, string> = {
  created: 'var(--cb-text-tertiary)',
  funding: 'var(--cb-success)',
  locked:  'var(--cb-accent)',
  drawing: 'var(--color-danger-500)',
  drawn:   'var(--cb-success)',
  archived:'var(--cb-text-tertiary)',
  aborted: 'var(--cb-danger)',
  paying:  'var(--cb-accent)',
};

export const WS_STATUS_CLASS: Record<string, string> = {
  connected:    'cb-status-dot-live',
  connecting:   'cb-status-dot-pending',
  disconnected: 'cb-status-dot-offline',
  error:        'cb-status-dot-error',
};

export interface GameRoomState {
  game: BlockchainGameState | null;
  nextGame: BlockchainGameState | null;
  playerTickets: Array<{ id: string; matrix: number[]; pricePaid?: string }>;
  room: EnrichedRoom | null;
  loadingGame: boolean;
  maxBalls: number;
  gamePatterns: Pattern[];
  gameCombinations: CombinationRuleInput[];
  ingameBalances: BlockchainBalance[];
  // WS
  drawnBalls: DrawnBall[]; lastBall: DrawnBall | null; isDrawing: boolean;
  winners: WinnerPayload[]; isAborted: boolean; abortReason: string | null;
  wsStatus: string; wsEverConnected: boolean; goldenBall: GoldenBallInfo | null; goldenMultiplierProgress: GoldenMultiplierProgress | null; clearedStages: ClearedStage[];
  prizeStatuses: Record<string, import('../../hooks/useSlowReveal').PrizeStatus>;
  apiPrizes: import('@cryptobingo/shared-types').PrizeTx[];
  drawMode: string | null;
  gameStages: StageRule[];
  // derivados
  isStaticFinalState: boolean;
  effectiveBalls: DrawnBall[]; drawnNumbers: number[]; drawnSet: Set<number>;
  lastDrawn: number | null; isEffectiveGameEnded: boolean;
  effectiveDisplayStatus: string; gameStatusText: string;
  timeRemaining: string; nextGameTimer: string;
  localWinners: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }>;
  winnerMap: Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>;
  patternByName: Map<string, Pattern>;
  playerWinEntries: Array<{ name: string; total: number; currency: string; isCombination: boolean; goldenMultiplier?: number }>;
  adjustedPatternWinCount: Map<string, number>;
  allGameCombinationWinCount: Map<string, number>;
  completedCombinationsPerTicket: Map<string, Array<{ name: string; weight: number }>>;
  combinationCells: Map<string, number[]>;
  patternProximityMap: Map<string, number>;
  combinationProximityMap: Map<string, number>;
  sortedPatterns: Pattern[];
  groupedTickets: ReturnType<typeof groupTicketsByCategory>;
  currencySymbol: string; ticketPrice: ExtendedAsset | undefined;
  col: string; color: string; hasBanners: boolean;
  now: number;
  loadGame: () => Promise<void>;
  hydratePrizeStatuses: (entries: Array<{
    ticketId: string; winLabel: string; transactionId: string; amount: string; currency: string;
  }>) => void;
}

export function useGameRoomState(
  { gameId, roomId, session }: { gameId: string; roomId?: string; session: Session },
): GameRoomState {
  const { t } = useTranslation();

  // ── Estado local ──────────────────────────────────────────────────────────
  const [game,         setGame]         = useState<BlockchainGameState | null>(null);
  const [nextGame,     setNextGame]     = useState<BlockchainGameState | null>(null);
  const [playerTickets,setPlayerTickets]= useState<Array<{ id: string; matrix: number[] }>>([]);
  const [room,         setRoom]         = useState<EnrichedRoom | null>(null);

  const [loadingGame,  setLoadingGame]  = useState(true);
  const [now,          setNow]          = useState(Date.now());
  const [maxBalls,          setMaxBalls]          = useState(75);
  const [gamePatterns,      setGamePatterns]      = useState<Pattern[]>([]);
  const [gameCombinations, setGameCombinations] = useState<CombinationRuleInput[]>([]);
  const [gameStages, setGameStages] = useState<StageRule[]>([]);
  const [localDrawMode, setLocalDrawMode] = useState<string | null>(null);
  // Prêmios da API (GET /games/:id/prizes) — fonte de verdade para
  // jogos arquivados MULTI_MATCH onde o WS não re-emite eventos.
  // Mantido em estado dedicado (além de prizeStatuses, que é hidratado
  // assincronamente) para que localWinners NÃO dependa exclusivamente
  // do timing da hidratação — evita "No winners" em jogo já pago.
  const [apiPrizes, setApiPrizes] = useState<import('@cryptobingo/shared-types').PrizeTx[]>([]);
  const [extendedRules,     setExtendedRules]     = useState<ExtendedRule[]>([]);
  const [ingameBalances,    setIngameBalances]    = useState<BlockchainBalance[]>([]);

  const AUTO_LOCK_SEC = 60;

  // Limpa estado obsoleto imediatamente quando o gameId muda.
  // Defesa em profundidade: o `key={gameId}` no App.tsx já causa remount,
  // mas este reset garante comportamento correto em qualquer contexto de uso.
  useEffect(() => {
    setGame(null);
    setNextGame(null);
    setPlayerTickets([]);
    setRoom(null);
    setMaxBalls(75);
    setGamePatterns([]);
    setGameCombinations([]);
    setExtendedRules([]);
    setIngameBalances([]);
    setLocalDrawMode(null);
    setLoadingGame(true);
  }, [gameId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const nextGameTimer = useMemo(() => {
    if (!nextGame || nextGame.status !== 'funding') return '';
    const closeAt = Number(nextGame.game_id) + AUTO_LOCK_SEC * 1000;
    const diff = closeAt - now;
    if (diff <= 0) return '0s';
    const s = Math.ceil(diff / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }, [nextGame, now]);


  // ── WebSocket (Slow Reveal) ───────────────────────────────────────────────
  const {
    drawnBalls, lastBall, isDrawing, winners, isAborted, abortReason, wsStatus,
    isGameEnded, goldenBall, goldenMultiplierProgress, clearedStages, drawMode,
    prizeStatuses, wsEverConnected, wsReceivedBalls, hydratePrizeStatuses,
  } = useSlowReveal(gameId);

  const timeRemaining = useMemo(() => {
    if (!game) return '';
    if (game.status === 'funding' && drawnBalls.length === 0 && !isDrawing) {
      const closeAt = Number(game.game_id) + AUTO_LOCK_SEC * 1000;
      const diff = closeAt - now;
      if (diff <= 0) return `${t('game_room.closing')}...`;
      const s = Math.ceil(diff / 1000);
      if (s < 60) return `${s}s`;
      return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
    }
    return '';
  }, [game, now, drawnBalls.length, isDrawing, t]);

  // ── Fallback para jogos archived/drawn sem eventos do WebSocket ───────────
  // O WS só envia eventos ao vivo; quando o jogo já encerrou, drawnBalls
  // permanece vazio. Populamos a partir de game.drawn_balls (blockchain).
  const isStaticFinalState = useMemo(() =>
    ['archived', 'drawn', 'paying'].includes(game?.status ?? '') && drawnBalls.length === 0,
    [game?.status, drawnBalls.length],
  );

  // Só usamos o fallback quando o reveal ao vivo NÃO vai mais acontecer:
  //  - isGameEnded (WS confirmou fim do reveal), OU
  //  - wsReceivedBalls (recebemos bolas ao vivo e o reveal parou), OU
  //  - jogo já 'archived' (entramos depois do término — visualização histórica).
  // Enquanto conectados a um jogo 'drawn' sem bolas nem game_ended, ESPERAMOS
  // (não mostramos o resultado final) — corrige flash do resultado logo após o lock.
  const showFallback = useMemo(() =>
    isStaticFinalState && (isGameEnded || wsReceivedBalls || (game?.status ?? '') === 'archived'),
    [isStaticFinalState, isGameEnded, wsReceivedBalls, game?.status],
  );

  const fallbackBalls = useMemo((): typeof drawnBalls => {
    if (!showFallback || !game) return [];
    const raw = game.drawn_balls;
    const arr: number[] = Array.isArray(raw) ? raw : parseHexMatrix(raw as unknown as string);
    return arr
      .slice(0, maxBalls)
      .filter(b => b !== 0)
      .map((num, idx) => ({ order: idx + 1, number: num, timestamp: '' }));
  }, [showFallback, game, maxBalls]);

  // Hidrata prizeStatuses da API p/ jogos encerrados onde WS não re-emite eventos
  useEffect(() => {
    if (!gameId || !showFallback) return;
    fetchGamePrizeTransactions(gameId)
      .then(res => {
        setApiPrizes(res.items ?? []);
        hydratePrizeStatuses((res.items ?? []).map(p => ({
          ticketId: p.ticketId,
          winLabel: p.winLabel,
          transactionId: p.transactionId ?? '',
          amount: p.amount,
          currency: p.currency,
        })));
      })
      .catch((err) => { console.error('[GameRoom] Falha ao hidratar prêmios:', err); });
  }, [gameId, isStaticFinalState, hydratePrizeStatuses]);

  const effectiveBalls = drawnBalls.length > 0 ? drawnBalls : fallbackBalls;

  const drawnNumbers = useMemo(
    () => effectiveBalls.map(b => b.number),
    [effectiveBalls],
  );
  const drawnSet  = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const lastDrawn = (lastBall?.number ?? effectiveBalls[effectiveBalls.length - 1]?.number) ?? null;

  // drawMode final: prefere on-chain (disponível desde o load), fallback WS game_ended
  const resolvedDrawMode = localDrawMode ?? drawMode;

  // Jogo efetivamente encerrado: via WS (game_ended) ou por fallback estático
  // (showFallback — reveal ao vivo não vai mais acontecer). Não basta wsEverConnected:
  // o socket conecta ANTES das bolas chegarem, então conectado+status drawn sem bolas
  // ainda é reveal em andamento → não mostramos o resultado final ainda.
  const isEffectiveGameEnded = isGameEnded || showFallback;

  // Status efetivo para exibição: enquanto o slow reveal estiver ativo (bolas chegando
  // via WS mas jogo ainda não encerrado), mostra "drawing" independentemente do status
  // blockchain — que pode já ser "drawn" enquanto o frontend ainda revela as bolas.
  // Status efetivo para exibição: mostra "drawing" enquanto o slow reveal ainda está
  // ativo, mesmo que o blockchain já marque o jogo como "drawn".
  const effectiveDisplayStatus = useMemo(() => {
    if (!game) return '';
    if (drawnBalls.length > 0 && !isGameEnded) return 'drawing';
    return game.status;
  }, [game, drawnBalls.length, isGameEnded]);

  const gameStatusText = useMemo(() => {
    if (!effectiveDisplayStatus) return '';
    return effectiveDisplayStatus;
  }, [effectiveDisplayStatus]);

  // ── Vencedores locais para estado archived sem WS ─────────────────────────
  // Quando o WS não tem vencedores (jogo já encerrou), calcula localmente
  // cruzando as cartelas do jogador com os padrões e as bolas sorteadas.
  // NOSONAR — business logic complexity inherent to prize aggregation, extracted where practical
  const localWinners = useMemo(() => {
    if (winners.length > 0 || !isStaticFinalState) return winners;
    const mode = localDrawMode ?? drawMode;
    // MULTI_MATCH: vencedores vêm dos estágios (WS/PrizePipeline/API),
    // não de padrões individuais nem de drawnSet — não bloquear por eles.
    if (mode !== 'multimatch') {
      if (!gamePatterns.length || !playerTickets.length || drawnSet.size === 0) return winners;
    } else if (!playerTickets.length) {
      return winners;
    }

    // MULTI_MATCH: vencedores vêm exclusivamente dos estágios via WS/PrizePipeline.
    // Não computar padrões individuais — isso marcaria cartelas como vencedoras
    // sem terem completado estágio.
    if (mode === 'multimatch') {
      // Tenta reconstruir de prizeStatuses (API hydrated) quando disponível.
      // Fallback: apiPrizes (estado dedicado populado pelo MESMO fetch)
      // — garante que o jogo arquivado mostre os vencedores pagos mesmo
      // se a hidratação de prizeStatuses não tiver refletido ainda.
      const stageResults: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }> = [];
      const seen = new Set<string>();
      const pushStage = (ticketId: string, winLabel: string, amount: string, currency: string) => {
        if (!winLabel?.startsWith('stage_')) return;
        const dedupKey = `${ticketId}:${winLabel}`;
        if (seen.has(dedupKey)) return;
        seen.add(dedupKey);
        stageResults.push({
          ticket_id: ticketId,
          win_pattern: winLabel,
          payouts: amount ? [`${amount} ${currency ?? ''}`.trim()] : [],
        });
      };
      const psKeys = Object.keys(prizeStatuses);
      if (psKeys.length > 0) {
        for (const [key, ps] of Object.entries(prizeStatuses)) {
          const [ticketId, winLabel] = key.split(':');
          pushStage(ticketId, winLabel, (ps as any)?.amount ?? '', (ps as any)?.currency ?? '');
        }
      } else if (apiPrizes.length > 0) {
        for (const p of apiPrizes) {
          pushStage(p.ticketId, p.winLabel, p.amount, p.currency);
        }
      }
      if (stageResults.length > 0) return stageResults;
      return [];
    }

    const result: Array<{ ticket_id: string; win_pattern: string; payouts: string[] }> = [];
    for (const ticket of playerTickets) {
      const B    = ticket.matrix.slice(0, 5);
      const I    = ticket.matrix.slice(5, 10);
      const Nraw = ticket.matrix.slice(10, 14);
      const G    = ticket.matrix.slice(14, 19);
      const O    = ticket.matrix.slice(19, 24);
      const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
      const flat: (number | null)[] = [];
      for (let r = 0; r < 5; r++) flat.push(B[r], I[r], N[r], G[r], O[r]);

      // ADR-005 max_weight: seleciona apenas o padrão de maior peso por cartela
      const pricePaidStr  = (ticket as any).pricePaid ?? '';
      const pricePaidNum  = parseFloat(pricePaidStr.split(' ')[0]) || 0;
      const currency      = pricePaidStr.trim().split(' ')[1] ?? '';

      let bestPayout = '';
      let bestPattern = '';
      let bestMultiplier = 0;

      for (const p of gamePatterns) {
        const done = p.cells.every((req, i) => {
          if (!req) return true;
          const val = flat[i];
          return val === null || drawnSet.has(val as number);
        });
        if (!done) continue;
        const multiplier = parseFloat(p.prize) || 0;
        if (multiplier <= bestMultiplier) continue;
        bestMultiplier = multiplier;
        bestPattern    = p.name;
        const prizeAmount = pricePaidNum * multiplier;
        bestPayout = prizeAmount > 0 && currency
          ? `${prizeAmount.toFixed(4)} ${currency}`
          : '';
      }

      if (bestPattern) {
        result.push({ ticket_id: ticket.id, win_pattern: bestPattern, payouts: bestPayout ? [bestPayout] : [] });
      }
    }
    return result;
  }, [winners, isStaticFinalState, gamePatterns, playerTickets, drawnSet, drawMode, localDrawMode, prizeStatuses, apiPrizes]);

  // constrói mapa ticket_id → prize + patternName + patternCount + totalPrize
  const winnerMap = useMemo(() => {
    const map = new Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>();
    for (const w of localWinners) {
      const existing = map.get(w.ticket_id);
      const ps = prizeStatuses[`${w.ticket_id}:${w.win_pattern}`];
      const amt = ps?.amount ?? w.payouts[0] ?? '0';
      const prizeVal = parseFloat(amt) || 0;
      // extrai currency do prizeStatuses ou do payout raw
      const curr = ps?.currency ?? w.payouts[0]?.split(' ').slice(1).join(' ') ?? '';
      if (existing) {
        existing.patternCount++;
        existing.totalPrize += prizeVal;
        existing.prize = `${existing.totalPrize.toFixed(4)} ${curr}`;
      } else {
        map.set(w.ticket_id, {
          prize: `${prizeVal.toFixed(4)} ${curr}`,
          patternName: w.win_pattern,
          totalPrize: prizeVal,
          patternCount: 1,
        });
      }
    }
    return map;
  }, [localWinners, prizeStatuses]);

  // lookup de Pattern pelo nome
  const patternByName = useMemo(() => {
    const map = new Map<string, Pattern>();
    for (const p of gamePatterns) map.set(p.name, p);
    return map;
  }, [gamePatterns]);

  // mapa patternId → nome  e  nome → tipo — usados para resolver cláusulas de combinação
  const { patternNameById, patternTypeByName } = useMemo(
    () => buildPatternTypeMaps(gamePatterns, extendedRules),
    [gamePatterns, extendedRules],
  );

  // vitórias do próprio jogador: combinações primeiro, depois padrões individuais
  // padrões absorvidos por combinações são excluídos da listagem individual
  const playerWinEntries = useMemo(() => {
    const playerTicketIds = new Set(playerTickets.map(t => t.id));
    const comboNameSet    = new Set(gameCombinations.map(c => c.name));

    const isWinGolden = (ticketId: string, patternName: string): number | undefined => {
      if (!goldenBall) return undefined;
      const pat = patternByName.get(patternName);
      if (!pat) return undefined;
      const ticket = playerTickets.find(t => t.id === ticketId);
      if (!ticket) return undefined;
      const m = ticket.matrix;
      for (let fi = 0; fi < 25; fi++) {
        if (!pat.cells[fi]) continue;
        const col = fi % 5;
        const row = Math.floor(fi / 5);
        if (col === 2 && row === 2) continue;
        let mi: number;
        if (col === 0) mi = row;
        else if (col === 1) mi = row + 5;
        else if (col === 2) mi = 10 + (row < 2 ? row : row - 1);
        else if (col === 3) mi = row + 14;
        else mi = row + 19;
        if (m[mi] === goldenBall.ballNum) return goldenBall.multiplier;
      }
      return undefined;
    };

    type WinEntry = { total: number; currency: string; goldenMultiplier?: number };
    const GOLD_KEY = '::gld';

    const byTicket = new Map<string, Array<{ pattern: string; payout: string }>>();
    for (const w of localWinners) {
      if (!playerTicketIds.has(w.ticket_id)) continue;
      const arr = byTicket.get(w.ticket_id) ?? [];
      arr.push({ pattern: w.win_pattern, payout: w.payouts[0] ?? '' });
      byTicket.set(w.ticket_id, arr);
    }
    const comboMap   = new Map<string, WinEntry>();
    const patternMap = new Map<string, WinEntry>();

    for (const [ticketId, wins] of byTicket) {
      const ticket       = playerTickets.find(t => t.id === ticketId);
      const pricePaidStr = (ticket as any)?.pricePaid ?? '';
      const pricePaidNum = parseFloat(pricePaidStr.split(' ')[0]) || 0;
      const priceCurrency = pricePaidStr.trim().split(' ')[1] ?? '';

      // caso 1: WS enviou nome do combo diretamente
      const directComboNames = new Set<string>();
      for (const w of wins) {
        if (!comboNameSet.has(w.pattern)) continue;
        directComboNames.add(w.pattern);
        const parts  = w.payout.trim().split(' ');
        const amount = parseFloat(parts[0]) || 0;
        const curr   = parts[1] || priceCurrency;
        const k = isWinGolden(ticketId, w.pattern) ? w.pattern + GOLD_KEY : w.pattern;
        const existing = comboMap.get(k);
        if (existing) existing.total += amount;
        else comboMap.set(k, { total: amount, currency: curr, goldenMultiplier: isWinGolden(ticketId, w.pattern) });
      }

      // caso 2: padrões individuais → detecta combos e aplica max_weight
      const patternWins = wins.filter(w => !directComboNames.has(w.pattern));
      if (patternWins.length > 0) {
        const patNames  = patternWins.map(w => w.pattern);
        const comboWins = detectComboWinsForTicket(patNames, gameCombinations, patternTypeByName, patternNameById);
        const subsumed  = new Set<string>();
        for (const { comboName, subsumedPatterns } of comboWins) {
          for (const sp of subsumedPatterns) subsumed.add(sp);
          const combo = gameCombinations.find(c => c.name === comboName);
          const fromPayouts = isStaticFinalState
            ? 0
            : patternWins
                .filter(w => subsumedPatterns.includes(w.pattern))
                .reduce((s, w) => s + (parseFloat(w.payout.split(' ')[0]) || 0), 0);
          const comboWeightMultiplier = combo ? combo.weight / 100 : 0;
          const comboTotal = fromPayouts > 0
            ? fromPayouts
            : pricePaidNum * comboWeightMultiplier;
          const k = isWinGolden(ticketId, comboName) ? comboName + GOLD_KEY : comboName;
          const existing = comboMap.get(k);
          if (existing) existing.total += comboTotal;
          else comboMap.set(k, { total: comboTotal, currency: priceCurrency, goldenMultiplier: isWinGolden(ticketId, comboName) });
        }
        for (const w of patternWins) {
          if (subsumed.has(w.pattern)) continue;
          const parts    = w.payout.trim().split(' ');
          const amount   = parseFloat(parts[0]) || 0;
          const currency = parts[1] ?? '';
          const k = isWinGolden(ticketId, w.pattern) ? w.pattern + GOLD_KEY : w.pattern;
          const existing = patternMap.get(k);
          if (existing) existing.total += amount;
          else patternMap.set(k, { total: amount, currency, goldenMultiplier: isWinGolden(ticketId, w.pattern) });
        }
      }
    }
    const stripKey = (k: string) => k.endsWith(GOLD_KEY) ? k.slice(0, -GOLD_KEY.length) : k;
    const hasGold  = (k: string) => k.endsWith(GOLD_KEY);
    const combos   = [...comboMap.entries()]
      .map(([k, v]) => ({ name: stripKey(k), ...v, isCombination: true, goldenMultiplier: hasGold(k) ? v.goldenMultiplier : undefined }))
      .sort((a, b) => b.total - a.total);
    const patterns = [...patternMap.entries()]
      .map(([k, v]) => ({ name: stripKey(k), ...v, isCombination: false, goldenMultiplier: hasGold(k) ? v.goldenMultiplier : undefined }))
      .sort((a, b) => b.total - a.total);
    return [...combos, ...patterns];
  }, [localWinners, playerTickets, gameCombinations, patternTypeByName, patternNameById, isStaticFinalState, goldenBall, patternByName]);

  // Detecta combinações satisfeitas em localWinners e constrói contagens ajustadas.
  // Padrões absorvidos por uma combinação são excluídos da contagem individual.
  const { adjustedPatternWinCount, allGameCombinationWinCount } = useMemo(() => {
    const byTicket = new Map<string, string[]>();
    for (const w of localWinners) {
      const arr = byTicket.get(w.ticket_id) ?? [];
      arr.push(w.win_pattern);
      byTicket.set(w.ticket_id, arr);
    }
    const comboCount = new Map<string, number>();
    const subsumedByTicket = new Map<string, Set<string>>();
    for (const [ticketId, patterns] of byTicket) {
      const comboWins = detectComboWinsForTicket(patterns, gameCombinations, patternTypeByName, patternNameById);
      const subsumed  = new Set<string>();
      for (const { comboName, subsumedPatterns } of comboWins) {
        comboCount.set(comboName, (comboCount.get(comboName) ?? 0) + 1);
        for (const sp of subsumedPatterns) subsumed.add(sp);
      }
      subsumedByTicket.set(ticketId, subsumed);
    }
    const patCount = new Map<string, number>();
    for (const w of localWinners) {
      if (subsumedByTicket.get(w.ticket_id)?.has(w.win_pattern)) continue;
      patCount.set(w.win_pattern, (patCount.get(w.win_pattern) ?? 0) + 1);
    }
    return { adjustedPatternWinCount: patCount, allGameCombinationWinCount: comboCount };
  }, [localWinners, gameCombinations, patternTypeByName, patternNameById]);

  // Combinações completadas nas cartelas do jogador (ao vivo)
  const completedCombinationsPerTicket = useMemo(() => {
    if (!gameCombinations.length) return new Map<string, Array<{ name: string; weight: number }>>();
    const result = new Map<string, Array<{ name: string; weight: number }>>();
    for (const ticket of playerTickets) {
      const flat = (() => {
        const B    = ticket.matrix.slice(0, 5);
        const I    = ticket.matrix.slice(5, 10);
        const Nraw = ticket.matrix.slice(10, 14);
        const G    = ticket.matrix.slice(14, 19);
        const O    = ticket.matrix.slice(19, 24);
        const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
        const f: (number | null)[] = [];
        for (let r = 0; r < 5; r++) f.push(B[r], I[r], N[r], G[r], O[r]);
        return f;
      })();

      // Padrões completados nesta cartela
      const doneNames = new Set<string>(
        gamePatterns
          .filter(p => p.cells.every((req, i) => !req || flat[i] === null || drawnSet.has(flat[i] as number)))
          .map(p => p.name),
      );

      // Resolve cláusulas all_of/any_of por nome (via patternNameById)
      const doneNamesResolved = new Set<string>();
      for (const name of doneNames) doneNamesResolved.add(name);
      // também aceita resolução por id (para compatibilidade com cláusulas que guardam id)
      for (const [id, name] of patternNameById) {
        if (doneNames.has(name)) doneNamesResolved.add(id);
      }

      const combos = gameCombinations
        .filter(c => isCombinationSatisfied(c, doneNamesResolved, patternTypeByName))
        .map(c => ({ name: c.name, weight: c.weight }));

      if (combos.length) result.set(ticket.id, combos);
    }
    return result;
  }, [gameCombinations, playerTickets, gamePatterns, drawnSet, patternNameById, patternTypeByName]);

  // Células visuais de cada combinação (union dos padrões membros, ordenados por ID)
  const combinationCells = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const c of gameCombinations) {
      map.set(c.name, getCombinationCells(c, gamePatterns, extendedRules, patternNameById));
    }
    return map;
  }, [gameCombinations, gamePatterns, extendedRules, patternNameById]);

  // Proximidade (0–1) de cada padrão nas cartelas do jogador, para barra de progresso
  const patternProximityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of gamePatterns) {
      map.set(p.name, computePatternUserProximity(playerTickets, drawnSet, p).maxCompletionPct);
    }
    return map;
  }, [gamePatterns, playerTickets, drawnSet]);

  // Proximidade (0–1) de cada combinação nas cartelas do jogador
  const combinationProximityMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of gameCombinations) {
      map.set(c.name, computeCombinationProximity(c, playerTickets, drawnSet, gamePatterns, patternNameById, patternTypeByName));
    }
    return map;
  }, [gameCombinations, playerTickets, drawnSet, gamePatterns, patternNameById, patternTypeByName]);

  // patterns ordenados por nº de cartelas que completaram (decrescente)

  // ── Cartelas ordenadas + agrupadas ─────────────────────────────────────
  const groupedTickets = useMemo(
    () => groupTicketsByCategory(playerTickets, drawnSet, gamePatterns, winnerMap, resolvedDrawMode ?? undefined, t),
    [playerTickets, drawnSet, gamePatterns, winnerMap, resolvedDrawMode],
  );

  // ── Carrega jogo + cartelas + room (se aplicável) ─────────────────────────
  const loadGame = useCallback(async () => {
    setLoadingGame(true);
    try {
      // Busca todos os tickets paginando (limit 50 por página) até não restar mais
      async function fetchAllTickets() {
        const rows: Array<{ ticket_id: string; owner: string; matrix: number[] | string; price?: { quantity: string; contract: string } }> = [];
        let lowerBound: string | undefined;
        while (true) {
          const res = await session.client.v1.chain.get_table_rows({
            code: CONTRACT, scope: UInt64.from(gameId), table: 'tickets',
            limit: 50, lower_bound: lowerBound as any, json: true,
          });
          rows.push(...(res.rows as typeof rows));
          if (!res.more || res.rows.length === 0) break;
          lowerBound = String(res.next_key);
        }
        return rows;
      }

      const actorScope = Name.from(session.actor).value.toString();
      const actorName  = Name.from(session.actor).toString();
      const [gameRes, allTickets, balRes] = await Promise.all([
        session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          lower_bound: UInt64.from(gameId), upper_bound: UInt64.from(gameId), limit: 1, json: true,
        }),
        fetchAllTickets(),
        session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: actorScope, table: 'balances', limit: 10, json: true,
        }).catch(() => ({ rows: [] })),
      ]);
      setIngameBalances(balRes.rows as BlockchainBalance[]);
      if (gameRes.rows.length) setGame(gameRes.rows[0] as BlockchainGameState);

      const loadedGame = gameRes.rows[0] as BlockchainGameState | undefined;

      // Sala é fonte de verdade do gametype_id — buscar antes dos patterns
      let roomData: EnrichedRoom | undefined;
      const roomIdToFetch = loadedGame?.room_id && loadedGame.room_id !== '0'
        ? loadedGame.room_id
        : roomId;
      if (roomIdToFetch) {
        try {
          const mod = await import('../../services/api');
          roomData = await mod.fetchRoom(roomIdToFetch);
        } catch { /* silencioso */ }
      }

      const gametypeId = roomData?.gametype_id ?? (loadedGame as any)?.gametype_id;
      if (gametypeId && String(gametypeId) !== '0') {
        try {
          const gtRes = await session.client.v1.chain.get_table_rows({
            code: CONTRACT, scope: CONTRACT, table: 'gametypes',
            lower_bound: UInt64.from(String(gametypeId)),
            upper_bound: UInt64.from(String(gametypeId)),
            limit: 1, json: true,
          });
          if (gtRes.rows.length) {
            const gt = gtRes.rows[0] as any;
            setMaxBalls(gt.max_balls > 0 ? Number(gt.max_balls) : 75);
            if (gt.draw_mode) setLocalDrawMode(gt.draw_mode);
          }
        } catch { /* mantém default 75 */ }
        try {
          const [patterns, meta] = await Promise.all([
            fetchGamePatterns(session, String(gametypeId)),
            fetchPublicGametypeMetadata(String(gametypeId)),
          ]);
          if (patterns.length) setGamePatterns(patterns);
          if (meta.combinations?.length) setGameCombinations(meta.combinations);
          if (meta.rules?.length) setExtendedRules(meta.rules);
          if (meta.stages?.length) setGameStages(meta.stages);
        } catch { /* patterns/combos indisponíveis */ }
      }

      if (roomData) {
        setRoom(roomData);
        if (loadedGame && ['archived', 'aborted'].includes(loadedGame.status)) {
          const nextId = String(roomData.current_game_id);
          if (nextId !== '0' && nextId !== gameId) {
            try {
              const nextRes = await session.client.v1.chain.get_table_rows({
                code: CONTRACT, scope: CONTRACT, table: 'games',
                lower_bound: UInt64.from(nextId), upper_bound: UInt64.from(nextId), limit: 1, json: true,
              });
              if (nextRes.rows.length) setNextGame(nextRes.rows[0] as BlockchainGameState);
            } catch { /* silencioso */ }
          }
        } else if (roomData.current_game_id && String(roomData.current_game_id) !== '0' && String(roomData.current_game_id) !== gameId) {
          try {
            const nextRes = await session.client.v1.chain.get_table_rows({
              code: CONTRACT, scope: CONTRACT, table: 'games',
              lower_bound: UInt64.from(String(roomData.current_game_id)),
              upper_bound: UInt64.from(String(roomData.current_game_id)), limit: 1, json: true,
            });
            if (nextRes.rows.length) setNextGame(nextRes.rows[0] as BlockchainGameState);
          } catch { /* silencioso */ }
        }
      }

      // A tabela `tickets` tem scope=game_id (todas as cartelas da partida, de todos
      // os jogadores). Filtramos por owner para exibir SOMENTE as cartelas do jogador
      // logado — sem isto, contas diferentes veem as cartelas umas das outras.
      setPlayerTickets(
        allTickets
          .filter(r => r.owner === actorName)
          .map(r => ({
            id:        r.ticket_id,
            matrix:    Array.isArray(r.matrix) ? r.matrix : parseHexMatrix(r.matrix as string),
            pricePaid: r.price?.quantity ?? loadedGame?.ticket_price?.quantity,
          }))
      );
    } catch (err) {
      console.error('[GameRoom] Erro ao carregar jogo:', err);
    } finally {
      setLoadingGame(false);
    }
  }, [session, gameId, roomId]);

  useEffect(() => {
    loadGame();
    const interval = setInterval(loadGame, 15_000);
    return () => clearInterval(interval);
  }, [loadGame]);

  const hasTrackedRoomEnter = useRef(false);
  useEffect(() => {
    if (game && !loadingGame && gameId && !hasTrackedRoomEnter.current) {
      hasTrackedRoomEnter.current = true;
      trackEvent('room_enter', { game_id: gameId });
    }
  }, [game, loadingGame, gameId]);

  // ── Derivações visuais ────────────────────────────────────────────────────
  const col   = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];

  const ticketPrice  = game?.ticket_price as ExtendedAsset | undefined;
  const roomPatterns: Pattern[] = gamePatterns;
  const sortedPatterns = useMemo(
    () => sortPatterns(roomPatterns, playerTickets, drawnSet, adjustedPatternWinCount),
    [roomPatterns, playerTickets, drawnSet, adjustedPatternWinCount],
  );

  const currencySymbol = (() => {
    const q = game?.ticket_price?.quantity ?? room?.currency?.quantity ?? '';
    return q.trim().split(' ').pop() || 'WAX';
  })();

  const hasBanners   = !!goldenBall || clearedStages.length > 0 || isEffectiveGameEnded;

  return {
    game, nextGame,
    playerTickets: playerTickets as Array<{ id: string; matrix: number[]; pricePaid?: string }>,
    room, loadingGame, maxBalls, gamePatterns, gameCombinations, ingameBalances,
    drawnBalls, lastBall, isDrawing, winners, isAborted, abortReason, wsStatus, wsEverConnected,
    goldenBall, goldenMultiplierProgress, clearedStages, prizeStatuses, drawMode: resolvedDrawMode, gameStages,
    isStaticFinalState,
    effectiveBalls, drawnNumbers, drawnSet, lastDrawn, isEffectiveGameEnded,
    effectiveDisplayStatus, gameStatusText, timeRemaining, nextGameTimer,
    localWinners, winnerMap, patternByName, playerWinEntries,
    adjustedPatternWinCount, allGameCombinationWinCount, completedCombinationsPerTicket,
    combinationCells, patternProximityMap, combinationProximityMap, sortedPatterns,
    groupedTickets, currencySymbol, ticketPrice, col, color, hasBanners, now, loadGame,
    hydratePrizeStatuses, apiPrizes,
  };
}
