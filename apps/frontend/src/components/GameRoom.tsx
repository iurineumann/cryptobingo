// apps/frontend/src/components/GameRoom.tsx
// Sala de jogo ao vivo — bola hero, histórico, cartelas do jogador, painel de padrões.
// Conecta ao WebSocket via useSlowReveal e busca o estado do jogo via RPC.
//
// Design: classes gr-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { Name, UInt64 } from '@wharfkit/antelope';
import type { MongoUserProfile, BlockchainGameState, BlockchainBalance, ExtendedAsset } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../services/api';
import { useSlowReveal } from '../hooks/useSlowReveal';
import BuyTicketModal from './BuyTicketModal';
import ChatFloating from './chat/ChatFloating';
import Logo from './Logo';
import { TicketCard } from './TicketCard';
import {
  Pattern, BINGO_COLORS, getCol,
  fetchGamePatterns, sortTickets, sortPatterns,
  groupTicketsByCategory, isCombinationSatisfied,
  computePatternUserProximity,
  getCombinationCells, computeCombinationProximity, detectComboWinsForTicket,
  type CombinationRuleInput, type ExtendedRule,
} from './ticketUtils';
import { fetchPublicGametypeMetadata } from '../services/api';

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '0s';
  const s = Math.ceil(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60 > 0 ? `${s % 60}s` : ''}`.trim();
}

function parseHexMatrix(hex: string): number[] {
  const bytes: number[] = [];
  const raw = hex.startsWith('0x') ? hex.slice(2) : hex;
  for (let i = 0; i < raw.length; i += 2) {
    bytes.push(parseInt(raw.substring(i, i + 2), 16));
  }
  return bytes;
}

// ==========================================
// TIPOS
// ==========================================

interface GameRoomProps {
  gameId:            string;
  roomId?:           string;
  session:           Session;
  profile:           MongoUserProfile;
  onLeave:           () => void;
  onGoToHistory?:    () => void;
  onGoToWallet?:     () => void;
  onGoToAdmin?:      () => void;
  isAdmin?:          boolean;
  onLogout?:         () => void;
  theme?:            'dark' | 'light';
  onToggleTheme?:    () => void;
  onLanguageChange?: (locale: string) => void;
}

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingogamectr';

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function GameRoom({
  gameId, roomId, session, profile, onLeave,
  onGoToHistory, onGoToWallet, onGoToAdmin, isAdmin,
  onLogout, theme, onToggleTheme, onLanguageChange,
}: GameRoomProps) {
  const { t, i18n } = useTranslation();

  // ── Estado local ──────────────────────────────────────────────────────────
  const [game,         setGame]         = useState<BlockchainGameState | null>(null);
  const [nextGame,     setNextGame]     = useState<BlockchainGameState | null>(null);
  const [playerTickets,setPlayerTickets]= useState<Array<{ id: string; matrix: number[] }>>([]);
  const [room,         setRoom]         = useState<EnrichedRoom | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);

  const [loadingGame,  setLoadingGame]  = useState(true);
  const [now,          setNow]          = useState(Date.now());
  const [maxBalls,          setMaxBalls]          = useState(75);
  const [gamePatterns,      setGamePatterns]      = useState<Pattern[]>([]);
  const [gameCombinations,  setGameCombinations]  = useState<CombinationRuleInput[]>([]);
  const [extendedRules,     setExtendedRules]     = useState<ExtendedRule[]>([]);
  const [ingameBalances,    setIngameBalances]    = useState<BlockchainBalance[]>([]);
  const [showMenu,          setShowMenu]          = useState(false);
  const density                         = 'comfortable' as const;

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
    setShowMenu(false);
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
    isGameEnded, goldenBall, clearedStages, drawMode,
  } = useSlowReveal(gameId);

  const timeRemaining = useMemo(() => {
    if (!game) return '';
    // Não mostrar contador se bolas já chegaram via WS — effectiveDisplayStatus já é 'drawing'
    if (game.status === 'funding' && drawnBalls.length === 0 && !isDrawing) {
      const closeAt = Number(game.game_id) + AUTO_LOCK_SEC * 1000;
      const diff = closeAt - now;
      if (diff <= 0) return '🔒 Fechando...';
      const s = Math.ceil(diff / 1000);
      if (s < 60) return `🔒 ${s}s`;
      return `🔒 ${Math.floor(s / 60)}m ${s % 60}s`;
    }
    return '';
  }, [game, now, drawnBalls.length, isDrawing]);

  // ── Fallback para jogos archived/drawn sem eventos do WebSocket ───────────
  // O WS só envia eventos ao vivo; quando o jogo já encerrou, drawnBalls
  // permanece vazio. Populamos a partir de game.drawn_balls (blockchain).
  const isStaticFinalState = useMemo(() =>
    ['archived', 'drawn', 'paying'].includes(game?.status ?? '') && drawnBalls.length === 0,
    [game?.status, drawnBalls.length],
  );

  const fallbackBalls = useMemo((): typeof drawnBalls => {
    if (!isStaticFinalState || !game) return [];
    const raw = game.drawn_balls;
    const arr: number[] = Array.isArray(raw) ? raw : parseHexMatrix(raw as unknown as string);
    return arr
      .slice(0, maxBalls)
      .filter(b => b !== 0)
      .map((num, idx) => ({ order: idx + 1, number: num, timestamp: '' }));
  }, [isStaticFinalState, game, maxBalls]);

  const effectiveBalls = drawnBalls.length > 0 ? drawnBalls : fallbackBalls;

  const drawnNumbers = useMemo(
    () => effectiveBalls.map(b => b.number),
    [effectiveBalls],
  );
  const drawnSet  = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const lastDrawn = (lastBall?.number ?? effectiveBalls[effectiveBalls.length - 1]?.number) ?? null;

  // Jogo efetivamente encerrado: via WS ou por status archived/drawn
  const isEffectiveGameEnded = isGameEnded || isStaticFinalState;

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
    const emoji: Record<string, string> = { created: '🕐', funding: '🟢', locked: '🔒', drawing: '🎲', drawn: '✅', archived: '📁', aborted: '❌', paying: '💸' };
    return `${emoji[effectiveDisplayStatus] ?? ''} ${effectiveDisplayStatus}`;
  }, [effectiveDisplayStatus]);

  // ── Vencedores locais para estado archived sem WS ─────────────────────────
  // Quando o WS não tem vencedores (jogo já encerrou), calcula localmente
  // cruzando as cartelas do jogador com os padrões e as bolas sorteadas.
  const localWinners = useMemo(() => {
    if (winners.length > 0 || !isStaticFinalState) return winners;
    if (!gamePatterns.length || !playerTickets.length || drawnSet.size === 0) return winners;

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
  }, [winners, isStaticFinalState, gamePatterns, playerTickets, drawnSet]);

  // constrói mapa ticket_id → prize + patternName + patternCount + totalPrize
  const winnerMap = useMemo(() => {
    const map = new Map<string, { prize: string; patternName: string; totalPrize: number; patternCount: number }>();
    for (const w of localWinners) {
      const existing = map.get(w.ticket_id);
      const prizeVal = parseFloat(w.payouts[0]) || 0;
      if (existing) {
        existing.patternCount++;
        existing.totalPrize += prizeVal;
      } else {
        map.set(w.ticket_id, {
          prize: w.payouts.join(', ') || null!,
          patternName: w.win_pattern,
          totalPrize: prizeVal,
          patternCount: 1,
        });
      }
    }
    return map;
  }, [localWinners]);

  // lookup de Pattern pelo nome
  const patternByName = useMemo(() => {
    const map = new Map<string, Pattern>();
    for (const p of gamePatterns) map.set(p.name, p);
    return map;
  }, [gamePatterns]);

  // mapa patternId → nome  e  nome → tipo — usados para resolver cláusulas de combinação
  const { patternNameById, patternTypeByName } = useMemo(() => {
    const byId   = new Map<string, string>();
    const byType = new Map<string, string>();
    for (const p of gamePatterns) {
      if (p.id) byId.set(p.id, p.name);
      const r = extendedRules.find(r => r.pattern_id === p.id);
      if (r) byType.set(p.name, r.type);
    }
    return { patternNameById: byId, patternTypeByName: byType };
  }, [gamePatterns, extendedRules]);

  // vitórias do próprio jogador: combinações primeiro, depois padrões individuais
  // padrões absorvidos por combinações são excluídos da listagem individual
  const playerWinEntries = useMemo(() => {
    const playerTicketIds = new Set(playerTickets.map(t => t.id));
    // nomes dos combos configurados neste gametype (para detectar wins diretos via WS)
    const comboNameSet    = new Set(gameCombinations.map(c => c.name));

    const byTicket = new Map<string, Array<{ pattern: string; payout: string }>>();
    for (const w of localWinners) {
      if (!playerTicketIds.has(w.ticket_id)) continue;
      const arr = byTicket.get(w.ticket_id) ?? [];
      arr.push({ pattern: w.win_pattern, payout: w.payouts[0] ?? '' });
      byTicket.set(w.ticket_id, arr);
    }
    const comboMap   = new Map<string, { total: number; currency: string }>();
    const patternMap = new Map<string, { total: number; currency: string }>();
    for (const [ticketId, wins] of byTicket) {
      const ticket       = playerTickets.find(t => t.id === ticketId);
      const pricePaidStr = (ticket as any)?.pricePaid ?? '';
      const pricePaidNum = parseFloat(pricePaidStr.split(' ')[0]) || 0;
      const priceCurrency = pricePaidStr.trim().split(' ')[1] ?? '';

      // caso 1: WS enviou nome do combo diretamente (worker chamou claimcombo)
      // — o payout já é o valor real do combo, não dos padrões membros
      const directComboNames = new Set<string>();
      for (const w of wins) {
        if (!comboNameSet.has(w.pattern)) continue;
        directComboNames.add(w.pattern);
        const parts  = w.payout.trim().split(' ');
        const amount = parseFloat(parts[0]) || 0;
        const curr   = parts[1] || priceCurrency;
        const existing = comboMap.get(w.pattern);
        if (existing) existing.total += amount;
        else comboMap.set(w.pattern, { total: amount, currency: curr });
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
          // Em modo estático, fromPayouts reflete prizes individuais dos padrões membros
          // (não o prêmio real do combo) — usar combo.weight diretamente.
          const fromPayouts = isStaticFinalState
            ? 0
            : patternWins
                .filter(w => subsumedPatterns.includes(w.pattern))
                .reduce((s, w) => s + (parseFloat(w.payout.split(' ')[0]) || 0), 0);
          const comboTotal = fromPayouts > 0
            ? fromPayouts
            : pricePaidNum * (combo ? combo.weight / 100 : 0);
          const existing = comboMap.get(comboName);
          if (existing) existing.total += comboTotal;
          else comboMap.set(comboName, { total: comboTotal, currency: priceCurrency });
        }
        for (const w of patternWins) {
          if (subsumed.has(w.pattern)) continue;
          const parts    = w.payout.trim().split(' ');
          const amount   = parseFloat(parts[0]) || 0;
          const currency = parts[1] ?? '';
          const existing = patternMap.get(w.pattern);
          if (existing) existing.total += amount;
          else patternMap.set(w.pattern, { total: amount, currency });
        }
      }
    }
    const combos   = [...comboMap.entries()]
      .map(([name, v]) => ({ name, ...v, isCombination: true }))
      .sort((a, b) => b.total - a.total);
    const patterns = [...patternMap.entries()]
      .map(([name, v]) => ({ name, ...v, isCombination: false }))
      .sort((a, b) => b.total - a.total);
    return [...combos, ...patterns];
  }, [localWinners, playerTickets, gameCombinations, patternTypeByName, patternNameById, isStaticFinalState]);

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
  const sortedTickets = useMemo(
    () => sortTickets(playerTickets, drawnSet, gamePatterns, winnerMap),
    [playerTickets, drawnSet, gamePatterns, winnerMap],
  );
  const groupedTickets = useMemo(
    () => groupTicketsByCategory(playerTickets, drawnSet, gamePatterns, winnerMap),
    [playerTickets, drawnSet, gamePatterns, winnerMap],
  );

  // ── Refs para animação ────────────────────────────────────────────────────
  const heroRef     = useRef<HTMLDivElement>(null);
  const seqRef      = useRef<HTMLDivElement>(null);
  const stageRef    = useRef<HTMLElement>(null);
  const patternsRef = useRef<HTMLElement>(null);
  const prevBall    = useRef<number | null>(null);

  // Sincroniza altura do patterns com a do stage
  useEffect(() => {
    const stage = stageRef.current;
    const patterns = patternsRef.current;
    if (!stage || !patterns) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        patterns.style.maxHeight = `${entry.contentBoxSize[0].blockSize}px`;
      }
    });
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!heroRef.current || lastDrawn === prevBall.current) return;
    prevBall.current = lastDrawn;
    const el = heroRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [lastDrawn]);

  // ── Carrega jogo + cartelas + room (se aplicável) ─────────────────────────
  const loadGame = useCallback(async () => {
    setLoadingGame(true);
    try {
      // Busca todos os tickets paginando (limit 50 por página) até não restar mais
      async function fetchAllTickets() {
        const rows: Array<{ ticket_id: string; matrix: number[] | string; price?: { quantity: string; contract: string } }> = [];
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

      // Busca max_balls do gametype (fallback = 75 para jogos sem gametype)
      const gametypeId = (loadedGame as any)?.gametype_id;
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
          }
        } catch { /* mantém default 75 */ }
        // Busca patterns e combinações deste gametype
        try {
          const [patterns, meta] = await Promise.all([
            fetchGamePatterns(session, String(gametypeId)),
            fetchPublicGametypeMetadata(String(gametypeId)),
          ]);
          if (patterns.length) setGamePatterns(patterns);
          if (meta.combinations?.length) setGameCombinations(meta.combinations);
          if (meta.rules?.length) setExtendedRules(meta.rules);
        } catch { /* patterns/combos indisponíveis */ }
      }
      if (loadedGame && loadedGame.room_id && loadedGame.room_id !== '0') {
        try {
          const { fetchRoom } = await import('../services/api');
          const roomData = await fetchRoom(loadedGame.room_id);
          setRoom(roomData);
          // Se o jogo atual terminou, busca o current_game_id da sala
          if (['archived', 'aborted'].includes(loadedGame.status)) {
            const nextId = String(roomData.current_game_id);
            if (nextId !== '0' && nextId !== gameId) {
              const nextRes = await session.client.v1.chain.get_table_rows({
                code: CONTRACT, scope: CONTRACT, table: 'games',
                lower_bound: UInt64.from(nextId), upper_bound: UInt64.from(nextId), limit: 1, json: true,
              });
              if (nextRes.rows.length) setNextGame(nextRes.rows[0] as BlockchainGameState);
            }
          }
        } catch { /* silencioso */ }
      } else if (roomId) {
        try {
          const { fetchRoom } = await import('../services/api');
          const roomData = await fetchRoom(roomId);
          setRoom(roomData);
          if (roomData.current_game_id && String(roomData.current_game_id) !== '0' && String(roomData.current_game_id) !== gameId) {
            const nextRes = await session.client.v1.chain.get_table_rows({
              code: CONTRACT, scope: CONTRACT, table: 'games',
              lower_bound: UInt64.from(String(roomData.current_game_id)),
              upper_bound: UInt64.from(String(roomData.current_game_id)), limit: 1, json: true,
            });
            if (nextRes.rows.length) setNextGame(nextRes.rows[0] as BlockchainGameState);
          }
        } catch { /* silencioso */ }
      }

      setPlayerTickets(
        allTickets.map(r => ({
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

  // ── Derivações visuais ────────────────────────────────────────────────────
  const col   = lastDrawn != null ? getCol(lastDrawn) : 'N';
  const color = BINGO_COLORS[col];

  const wsStatusClass: Record<string, string> = {
    connected:    'cb-status-dot-live',
    connecting:   'cb-status-dot-pending',
    disconnected: 'cb-status-dot-offline',
    error:        'cb-status-dot-error',
  };

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

  return (
    <div className="gr-shell">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="gr-navbar" data-testid="gr-room-header">

        {/* ── Esquerda: logo + crumb ── */}
        <div className="gr-nav-left">
          <Logo variant="icon" height={28} onClick={onLeave} alt="Voltar ao Lobby" />
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)', fontSize: '0.75rem' }}>
              {room?.metadata?.name ?? (room ? `Sala ${room.room_id}` : `#${gameId}`)}
            </span>
            {game && (
              <span data-testid="gr-game-status" data-status={effectiveDisplayStatus} className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary]">
                {gameStatusText}
              </span>
            )}
            {timeRemaining && (
              <span className="text-xs font-mono font-bold text-[--cb-accent] bg-[--cb-bg-elevated] px-2 py-0.5 rounded-md border border-[--cb-border-default]">
                {timeRemaining}
              </span>
            )}
            {isDrawing && <span className="gr-live">{t('game_room.badge_live')}</span>}
            {isAborted && <span className="cb-status-aborted">{t('game_room.badge_aborted')}</span>}
          </div>
        </div>

        {/* ── Direita: saldo + chat + status WS + idioma + menu ── */}
        <div className="gr-nav-right">

          {/* Saldo in-game */}
          {ingameBalances.length > 0 && (
            <span
              className="lobby-wallet-chip"
              title={t('lobby.balance_aria')}
              style={{ fontSize: '0.72rem' }}
            >
              <span className="symbol" aria-hidden="true">◆</span>
              {ingameBalances.map((b, i) => (
                <span key={i} style={i > 0 ? { borderLeft: '1px solid var(--cb-border-subtle)', paddingLeft: '0.4rem', marginLeft: '0.2rem' } : {}}>
                  {b.balance.quantity}
                </span>
              ))}
            </span>
          )}

          {/* Seletor de idioma */}
          <select
            value={i18n.language}
            onChange={e => { i18n.changeLanguage(e.target.value); onLanguageChange?.(e.target.value); }}
            className="cb-input cb-select"
            style={{ padding: '0.25rem 1.75rem 0.25rem 0.5rem', fontSize: '0.72rem', height: '2rem', width: 'auto' }}
            aria-label={t('common.language') ?? 'Idioma'}
          >
            <option value="pt-BR">PT</option>
            <option value="en-US">EN</option>
            <option value="zh-CN">中</option>
          </select>

          {/* Status WS */}
          <span
            className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`}
            title={t('game_room.ws_title', { status: wsStatus })}
            aria-label={t('game_room.ws_aria', { status: wsStatus })}
          />

          {/* Menu dropdown ⋮ */}
          <div style={{ position: 'relative' }}>
            <button
              className="cb-btn cb-btn-ghost cb-btn-sm"
              style={{ width: '2rem', padding: 0, fontSize: '1.1rem' }}
              onClick={() => setShowMenu(s => !s)}
              aria-label="Menu"
              aria-expanded={showMenu}
              aria-haspopup="menu"
            >
              ⋮
            </button>
            {showMenu && (
              <>
                {/* Overlay para fechar ao clicar fora */}
                <div
                  style={{ position: 'fixed', inset: 0, zIndex: 49 }}
                  onClick={() => setShowMenu(false)}
                  aria-hidden="true"
                />
                <div
                  role="menu"
                  style={{
                    position: 'absolute', right: 0, top: 'calc(100% + 0.375rem)',
                    zIndex: 50, minWidth: '11rem',
                    background: 'var(--cb-bg-elevated)',
                    border: '1px solid var(--cb-border-default)',
                    borderRadius: '0.75rem',
                    boxShadow: 'var(--shadow-card-hover)',
                    padding: '0.375rem',
                    display: 'flex', flexDirection: 'column', gap: '0.125rem',
                  }}
                >
                  <button
                    role="menuitem"
                    data-testid="gr-nav-lobby"
                    className="cb-btn cb-btn-ghost cb-btn-sm"
                    style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                    onClick={() => { setShowMenu(false); onLeave(); }}
                  >
                    🏠 {t('game_room.back_to_lobby')}
                  </button>

                  {onGoToHistory && (
                    <button
                      role="menuitem"
                      data-testid="gr-nav-history"
                      className="cb-btn cb-btn-ghost cb-btn-sm"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                      onClick={() => { setShowMenu(false); onGoToHistory(); }}
                    >
                      📋 {t('nav.my_history') ?? 'Histórico'}
                    </button>
                  )}

                  {onGoToWallet && (
                    <button
                      role="menuitem"
                      data-testid="gr-nav-wallet"
                      className="cb-btn cb-btn-ghost cb-btn-sm"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                      onClick={() => { setShowMenu(false); onGoToWallet(); }}
                    >
                      💳 {t('nav.wallet') ?? 'Carteira'}
                    </button>
                  )}

                  {isAdmin && onGoToAdmin && (
                    <button
                      role="menuitem"
                      data-testid="gr-nav-admin"
                      className="cb-btn cb-btn-ghost cb-btn-sm"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                      onClick={() => { setShowMenu(false); onGoToAdmin(); }}
                    >
                      ⚙ Admin
                    </button>
                  )}

                  {onToggleTheme && (
                    <button
                      role="menuitem"
                      className="cb-btn cb-btn-ghost cb-btn-sm"
                      style={{ justifyContent: 'flex-start', gap: '0.5rem' }}
                      onClick={() => { setShowMenu(false); onToggleTheme(); }}
                    >
                      {theme === 'dark' ? '☾' : '☀'} {theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
                    </button>
                  )}

                  {onLogout && (
                    <>
                      <div style={{ height: '1px', background: 'var(--cb-border-subtle)', margin: '0.25rem 0.375rem' }} />
                      <button
                        role="menuitem"
                        className="cb-btn cb-btn-ghost cb-btn-sm"
                        style={{ justifyContent: 'flex-start', gap: '0.5rem', color: 'var(--cb-danger)' }}
                        onClick={() => { setShowMenu(false); onLogout(); }}
                      >
                        ⏻ {t('nav.logout') ?? 'Desconectar'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )}
          </div>

        </div>
      </header>

      {/* ── Grid principal ──────────────────────────────────────────────────── */}
      <div className={`gr-main gr-${density}`}>

        {/* ── Linha superior: stage + patterns lado a lado ───────────────────── */}
        <div className="gr-top-row">

          {/* ── Stage ────────────────────────────────────────────────────────── */}
          <section
            ref={stageRef}
            className="gr-stage"
            data-stage-style="spotlight"
            aria-label="Sorteio em tempo real"
          >
            <div className="gr-stage-header">
              <span className="gr-stage-label">{t('game_room.last_ball_heading')}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--cb-text-tertiary)' }}>
                <span className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`} aria-hidden="true" />
                <span style={{ fontWeight: 600, color: 'var(--cb-text-secondary)' }}>
                  {t('game_room.ball_count', { count: drawnNumbers.length })}
                </span>
              </span>
            </div>

            <div className="gr-stage-body">
              <div className="gr-stage-spot" style={{ '--ball-color': color } as React.CSSProperties}>
                <div className="gr-ball-halo" aria-hidden="true" />

                <div
                  ref={heroRef}
                  data-testid="gr-ball-hero"
                  className="gr-ball-hero"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={lastDrawn != null ? t('game_room.hero_ball_aria', { number: lastDrawn, count: drawnNumbers.length }) : t('game_room.hero_ball_waiting')}
                >
                  <div className="ball-surface" aria-hidden="true" />
                  <span className="ball-letter">{col}</span>
                  <span className="ball-number" data-testid="gr-ball-hero-number">{lastDrawn ?? '⭐'}</span>
                  {lastDrawn != null && (
                    <span className="ball-order">{t('game_room.ball_order', { ordem: drawnNumbers.length })}</span>
                  )}
                </div>

                {lastDrawn != null && (
                  <div className="gr-call" aria-hidden="true">
                    <span className="col-tag">{col}</span>
                    <span>{lastDrawn}</span>
                  </div>
                )}
              </div>

              {/* Footer: histórico + progress */}
              <div className="gr-stage-footer">
                <div ref={seqRef} data-testid="gr-ball-history" className="gr-sequence" aria-label={t('game_room.history_aria')}>
                  {[...effectiveBalls].reverse().map((ball, idx) => {
                    const c   = getCol(ball.number);
                    const clr = BINGO_COLORS[c];
                    return (
                      <div
                        key={ball.order}
                        className={`gr-mini-ball${idx === 0 ? ' latest' : ''}`}
                        style={{ '--ball-color': clr } as React.CSSProperties}
                        title={`${c}${ball.number}`}
                      >
                        {ball.number}
                      </div>
                    );
                  })}
                </div>
                <div className="gr-progress">
                  <div className="gr-progress-row">
                    <span>{t('game_room.progress_label')}</span>
                    <span className="count">{drawnNumbers.length}/{maxBalls}</span>
                  </div>
                  <div className="cb-progress-track">
                    <div className="cb-progress-fill" style={{ width: `${Math.min((drawnNumbers.length / maxBalls) * 100, 100)}%` }} />
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ── Painel de Padrões ──────────────────────────────────────────────── */}
          {showPatterns && (
            <aside ref={patternsRef} data-testid="gr-patterns-panel" className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
              <div className="gr-patterns-head">
                <span className="title">{t('game_room.patterns_heading')}</span>
                <button
                  className="cb-btn cb-btn-ghost cb-btn-sm"
                  onClick={() => setShowPatterns(false)}
                  aria-label={t('game_room.patterns_hide_aria')}
                >✕</button>
              </div>
              <div className="gr-patterns-list">
                {roomPatterns.length === 0 ? (
                  <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                    {loadingGame ? t('game_room.patterns_loading') : t('game_room.patterns_empty')}
                  </div>
                ) : (
                  <>
                    {sortedPatterns.map(p => {
                      const winCount  = adjustedPatternWinCount.get(p.name) ?? 0;
                      const patternWon = winCount > 0;
                      const proxPct   = patternProximityMap.get(p.name) ?? 0;
                      return (
                        <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                          <div className="gr-pattern-mini">
                            {p.cells.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                          </div>
                          <div className="gr-pattern-info">
                            <span className="name">{p.name}</span>
                            <div className="mini-progress">
                              <i style={{ width: patternWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                            </div>
                            <span className="meta">
                              {patternWon
                                ? `${t('game_room.pattern_completed')} (${winCount})`
                                : proxPct > 0
                                  ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                                  : `${p.cells.filter(Boolean).length} cells`}
                            </span>
                          </div>
                          <div className="gr-pattern-prize">
                            <span className="amt">{p.prize}x</span>
                            <span className="hits">{currencySymbol}</span>
                          </div>
                        </div>
                      );
                    })}
                    {gameCombinations.map(c => {
                      const winCount  = allGameCombinationWinCount.get(c.name) ?? 0;
                      const comboWon  = winCount > 0;
                      const proxPct   = combinationProximityMap.get(c.name) ?? 0;
                      const cells     = combinationCells.get(c.name) ?? new Array(25).fill(0);
                      const myCombo   = [...completedCombinationsPerTicket.values()].some(v => v.some(cc => cc.name === c.name));
                      return (
                        <div key={c.name} className={`gr-pattern gr-pattern--combo${comboWon ? ' is-close' : ''}`}>
                          <div className="gr-pattern-mini">
                            {cells.map((on: number, j: number) => <i key={j} className={on ? 'on' : ''} />)}
                          </div>
                          <div className="gr-pattern-info">
                            <span className="name">
                              {myCombo && <span title={t('game_room.my_combo_badge')}>⭐ </span>}
                              🔗 {c.name}
                            </span>
                            <div className="mini-progress">
                              <i style={{ width: comboWon ? '100%' : `${Math.round(proxPct * 100)}%` }} />
                            </div>
                            <span className="meta">
                              {comboWon
                                ? `${t('game_room.pattern_completed')} (${winCount})`
                                : proxPct > 0
                                  ? t('game_room.pattern_progress', { pct: Math.round(proxPct * 100) })
                                  : t('game_room.combo_meta')}
                            </span>
                          </div>
                          <div className="gr-pattern-prize">
                            <span className="amt">{(c.weight / 100).toFixed(2)}x</span>
                            <span className="hits">{currencySymbol}</span>
                          </div>
                        </div>
                      );
                    })}
                  </>
                )}
              </div>
            </aside>
          )}

        </div>{/* fim gr-top-row */}

        {/* ── Banners: só renderiza o wrapper quando há pelo menos um ativo ─── */}
        {hasBanners && (
          <div className="gr-banners-row">

            {/* ADR-014: Golden Ball */}
            {goldenBall && (
              <div className="gr-golden-banner" role="status" aria-live="assertive">
                <span className="gr-golden-icon">🌟</span>
                <div className="gr-golden-text">
                  <strong>{t('game_room.golden_ball_title')}</strong>
                  <span>{t('game_room.golden_ball_desc', { ball: goldenBall.ballNum, multiplier: goldenBall.multiplier })}</span>
                </div>
                <span className="gr-golden-mult">×{goldenBall.multiplier}</span>
              </div>
            )}

            {/* ADR-013: Multi-Match stages */}
            {clearedStages.length > 0 && (
              <div className="gr-stages-panel" role="status">
                <span className="gr-stages-title">{t('game_room.stages_title')}</span>
                <div className="gr-stages-list">
                  {clearedStages.map(s => (
                    <div key={s.stage} className="gr-stage-item">
                      <span className="gr-stage-badge">
                        {t('game_room.stage_label', { stage: s.stage })}
                      </span>
                      <span className="gr-stage-count">
                        {t('game_room.stage_winners', { count: s.winners.length })}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ADR-014: Game Ended */}
            {isEffectiveGameEnded && (
              <div
                data-testid="gr-ended-overlay"
                className={`gr-ended-banner${playerWinEntries.length > 0 ? ' gr-ended-banner--winner' : ''}`}
                role="status"
                aria-live="polite"
              >
                <span className="gr-ended-icon">
                  {playerWinEntries.length > 0 ? '🏆' : '🏁'}
                </span>
                <div className="gr-ended-text">
                  <strong>{t('game_room.game_ended_title')}</strong>
                  <span>
                    {playerWinEntries.length > 0
                      ? t('game_room.game_ended_you_won')
                      : localWinners.length > 0
                        ? t('game_room.game_ended_winners', { count: localWinners.length })
                        : isStaticFinalState && playerTickets.length === 0
                          ? t('game_room.game_ended_archived')
                          : t('game_room.game_ended_no_winners')}
                  </span>

                  {playerWinEntries.length > 0 && (
                    <div className="gr-ended-breakdown" data-testid="gr-prize-breakdown">
                      {playerWinEntries.map(({ name, total, currency, isCombination }) => (
                        <div key={name} className="gr-ended-breakdown-row" data-testid="gr-prize-breakdown-row">
                          <span className="gr-ended-breakdown-pattern">
                            {isCombination && '🔗 '}{name}
                          </span>
                          <span className="gr-ended-breakdown-prize">
                            {total.toFixed(4)} {currency}
                          </span>
                        </div>
                      ))}
                      {playerWinEntries.length > 1 && (
                        <div className="gr-ended-breakdown-row gr-ended-breakdown-total">
                          <span>{t('game_room.game_ended_total')}</span>
                          <span>
                            {playerWinEntries.reduce((s, e) => s + e.total, 0).toFixed(4)}{' '}
                            {playerWinEntries[0]?.currency}
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {nextGame && nextGame.status === 'funding' ? (
                    <span className="gr-ended-next">
                      {t('game_room.next_game_funding', { time: nextGameTimer })}
                    </span>
                  ) : (() => {
                    const endMs   = (game?.end_time ?? 0) * 1000;
                    const delayMs = ((room?.metadata as any)?.auto_start_delay_sec ?? 30) * 1000;
                    const estMs   = endMs > 0 ? endMs + delayMs - now : 0;
                    if (estMs > 0) {
                      return (
                        <span className="gr-ended-next">
                          {t('game_room.next_game_soon', { time: fmtCountdown(estMs) })}
                        </span>
                      );
                    }
                    return (
                      <span className="gr-ended-next">{t('game_room.game_ended_next')}</span>
                    );
                  })()}
                </div>
                {nextGame && nextGame.status === 'funding' && (
                  <button
                    data-testid="gr-next-game-btn"
                    className="cb-btn cb-btn-primary cb-btn-sm"
                    onClick={onLeave}
                  >
                    {t('game_room.go_to_next')}
                  </button>
                )}
                {onGoToHistory && (
                  <button
                    data-testid="gr-view-history"
                    className="cb-btn cb-btn-ghost cb-btn-sm"
                    onClick={onGoToHistory}
                  >
                    {t('nav.my_history') ?? 'Histórico'}
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <div className="gr-tickets-section" data-testid="gr-my-tickets">
          <div className="gr-tickets-head">
            <span className="title">
              {t('game_room.my_tickets_heading')}
              <span className="count">{playerTickets.length}</span>
            </span>
            {game?.status === 'funding' && ticketPrice && (
              <button
                className="cb-btn cb-btn-primary cb-btn-sm"
                data-testid="gr-buy-more"
                onClick={() => setShowBuyModal(true)}
              >
                {t('game_room.buy_more')}
              </button>
            )}
          </div>

          {playerTickets.length === 0 ? (
            <div className="gr-summary-empty">
              {loadingGame
                ? t('game_room.tickets_loading')
                : game?.status === 'funding'
                  ? t('game_room.tickets_empty_funding')
                  : t('game_room.tickets_empty_default')}
            </div>
          ) : (
            groupedTickets.map(group => (
              <div key={group.category} className="gr-tickets-group">
                <div className="gr-tickets-group-label">
                  <span className="gr-tickets-group-icon">{group.icon}</span>
                  <span className="gr-tickets-group-title">{group.label}</span>
                  <span className="gr-tickets-group-count">{group.tickets.length}</span>
                </div>
                <div className="gr-tickets-grid">
                  {group.tickets.map(ticket => {
                    const w = winnerMap.get(ticket.id);
                    const pat = w ? patternByName.get(w.patternName) : undefined;
                    const winPatternSet = pat
                      ? new Set(pat.cells.map((req, i) => (req ? i : -1)).filter(i => i !== -1))
                      : null;
                    return (
                      <TicketCard
                        key={ticket.id}
                        ticketId={ticket.id}
                        matrix={ticket.matrix}
                        drawnSet={drawnSet}
                        lastDrawn={lastDrawn}
                        winPattern={winPatternSet}
                        prize={w?.prize ?? null}
                        density={density}
                        patterns={roomPatterns}
                        completedCombinations={completedCombinationsPerTicket.get(ticket.id)}
                        pricePaid={ticket.pricePaid}
                      />
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>

      </div>

      {/* ── Confetti de vitória ────────────────────────────────────────────── */}
      {isEffectiveGameEnded && playerWinEntries.length > 0 && (
        <div className="gr-confetti-overlay" aria-hidden="true">
          {Array.from({ length: 24 }, (_, i) => (
            <span
              key={i}
              className="gr-confetti"
              style={{
                left:             `${(i * 4.17) % 100}%`,
                '--dx':           `${Math.round(Math.sin(i * 2.399) * 70)}px`,
                animationDelay:   `${((i * 0.37) % 2.8).toFixed(2)}s`,
                background:       ['#f59e0b','#8b5cf6','#06b6d4','#10b981','#ef4444','#ec4899'][i % 6],
              } as React.CSSProperties}
            />
          ))}
        </div>
      )}

      {/* ── Chat Floating ──────────────────────────────────────────────────── */}
      {room && (
        <ChatFloating
          roomId={room.room_id}
          roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
          walletAddress={profile.wallet_address}
        />
      )}

      {/* ── Modal de compra ────────────────────────────────────────────────── */}
      {showBuyModal && ticketPrice && (
        <BuyTicketModal
          gameId={gameId}
          ticketPrice={ticketPrice}
          session={session}
          onClose={() => setShowBuyModal(false)}
          onSuccess={() => { setShowBuyModal(false); loadGame(); }}
          maxTicketsPerPlayer={room?.max_tickets_per_player}
          roomPriceMin={room?.ticket_price_min}
          roomPriceMax={room?.ticket_price_max}
          roomPriceDefault={room?.ticket_price_default}
        />
      )}
    </div>
  );
}
