// apps/frontend/src/components/GameRoom.tsx
// Sala de jogo ao vivo — bola hero, histórico, cartelas do jogador, painel de padrões.
// Conecta ao WebSocket via useSlowReveal e busca o estado do jogo via RPC.
//
// Design: classes gr-* definidas em globals.design.css
// Ref: SPEC.md §4, ADR-007 (Slow Reveal)

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Session } from '@wharfkit/session';
import { UInt64 } from '@wharfkit/antelope';
import type { MongoUserProfile, BlockchainGameState, ExtendedAsset } from '@cryptobingo/shared-types';
import type { EnrichedRoom } from '../services/api';
import { useSlowReveal } from '../hooks/useSlowReveal';
import BuyTicketModal from './BuyTicketModal';
import ChatPanel from './chat/ChatPanel';

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
  gameId:  string;
  roomId?: string;
  session: Session;
  profile: MongoUserProfile;
  onLeave: () => void;
}

const BINGO_COLORS: Record<string, string> = {
  B: 'var(--color-bingo-b)',
  I: 'var(--color-bingo-i)',
  N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)',
  O: 'var(--color-bingo-o)',
};

function getCol(n: number): string {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

const CONTRACT = import.meta.env.VITE_CONTRACT_ACCOUNT ?? 'bingo.game';
const COLS     = ['B', 'I', 'N', 'G', 'O'];

function maskToCells(mask: number): number[] {
  return Array.from({ length: 25 }, (_, i) => (mask >> i) & 1);
}

function weightToPrize(weight: number): string {
  return (weight / 100).toFixed(2);
}

function computeProximityScore(matrix: number[], drawnSet: Set<number>, patterns: Pattern[]): number {
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

async function fetchGamePatterns(session: Session, gametypeId: string): Promise<Pattern[]> {
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
          name: pat.name,
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

interface Pattern {
  name:  string;
  prize: string;
  cells: number[]; // 25 elementos row-major (0|1); índice 12 = FREE SPACE
}

// ==========================================
// SUB-COMPONENTE: Cartela 5×5
// ==========================================

interface TicketCardProps {
  ticketId:    string;
  matrix:      number[];
  drawnSet:    Set<number>;
  lastDrawn:   number | null;
  winPattern:  Set<number> | null;
  prize:       string | null;
  density:     'comfortable' | 'compact';
  patterns:    Pattern[];
}

function TicketCard({ ticketId, matrix, drawnSet, lastDrawn, winPattern, prize, density, patterns }: TicketCardProps) {
  const { t } = useTranslation();
  // Constrói grid 5×5 coluna-maior → linha-maior (layout: bits 0-24, bit12=FREE)
  const grid = useMemo(() => {
    const B    = matrix.slice(0, 5);
    const I    = matrix.slice(5, 10);
    const Nraw = matrix.slice(10, 14);
    const G    = matrix.slice(14, 19);
    const O    = matrix.slice(19, 24);
    const N    = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
    return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
  }, [matrix]);

  const markedCount = useMemo(
    () => matrix.filter(n => drawnSet.has(n)).length + 1, // +1 FREE
    [matrix, drawnSet],
  );

  // Detecção de padrões completados via cells[25] row-major
  const { completedPatterns, winningCells } = useMemo(() => {
    const isCellMarked = (i: number) => {
      const val = grid[Math.floor(i / 5)][i % 5];
      return val === null || drawnSet.has(val as number);
    };
    const completed = patterns.filter(p =>
      p.cells.every((req, i) => !req || isCellMarked(i))
    );
    const winning = new Set<number>();
    completed.forEach(p => p.cells.forEach((req, i) => { if (req) winning.add(i); }));
    return { completedPatterns: completed, winningCells: winning };
  }, [grid, drawnSet, patterns]);

  const isWinner = winPattern !== null || completedPatterns.length > 0;
  const isClose  = !isWinner && markedCount >= (density === 'compact' ? 20 : 18);

  return (
    <article
      className={[
        'gr-ticket',
        isWinner ? 'is-winner' : '',
        isClose  ? 'is-close'  : '',
        !isWinner && !isClose && markedCount < 3 ? 'is-dimmed' : '',
      ].filter(Boolean).join(' ')}
      aria-label={isWinner ? t('game_room.ticket_winner_aria', { ticketId }) : t('game_room.ticket_aria', { ticketId })}
    >
      <div className="gr-ticket-header">
        <div className="gr-ticket-id">
          <span className="label">{t('game_room.ticket_label')}</span>
          <span className="id">#{ticketId}</span>
        </div>
        <span className={`gr-ticket-marks${isWinner ? ' is-winner' : isClose ? ' is-close' : ''}`}>
          {isWinner ? t('game_room.winner_badge') : `${markedCount}/25`}
        </span>
      </div>

      <div className="gr-bingo-grid" role="grid" aria-label={t('game_room.ticket_aria', { ticketId })}>
        <div className="gr-bingo-grid-head" role="row">
          {COLS.map(c => (
            <div key={c} className="gr-bingo-head" role="columnheader" style={{ background: BINGO_COLORS[c] }}>
              {c}
            </div>
          ))}
        </div>
        <div className="gr-bingo-grid-body">
          {grid.map((row, ri) => (
            <div key={ri} className="gr-bingo-row" role="row">
              {row.map((val, ci) => {
                const gridIdx   = ri * 5 + ci;
                const isFree    = val === null;
                const isMarked  = isFree || drawnSet.has(val as number);
                const isJustHit = !isFree && val === lastDrawn;
                const inWin     = (winPattern?.has(gridIdx) ?? false) || winningCells.has(gridIdx);
                const color     = BINGO_COLORS[COLS[ci]];

                return (
                  <div
                    key={ci}
                    role="gridcell"
                    aria-selected={isMarked}
                    aria-label={isFree ? t('game_room.free_space_aria') : isMarked ? t('game_room.cell_marked_aria', { col: COLS[ci], val }) : t('game_room.cell_aria', { col: COLS[ci], val })}
                    className={[
                      'gr-bingo-cell',
                      isFree               ? 'is-free'            : '',
                      isMarked && !isFree  ? 'is-marked'          : '',
                      isJustHit            ? 'is-just-hit'        : '',
                      inWin                ? 'in-winning-pattern' : '',
                    ].filter(Boolean).join(' ')}
                    style={isMarked && !isFree ? { '--cell-color': color } as React.CSSProperties : {}}
                  >
                    {isFree ? '⭐' : val}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {completedPatterns.length > 0 && (
        <div className="gr-ticket-patterns">
          {completedPatterns.map(p => (
            <span key={p.name} className="gr-ticket-pattern-badge">
              <span>⭐</span>{p.name}
            </span>
          ))}
        </div>
      )}

      <div className="gr-ticket-foot">
        <span className="best">
          {isWinner
            ? t('game_room.ticket_footer_pattern', { count: completedPatterns.length || 1 })
            : t('game_room.ticket_footer_marked', { marked: markedCount, total: 25 })}
        </span>
        {prize && <span className={`prize${isWinner ? ' is-paid' : ''}`}>{prize}</span>}
      </div>
    </article>
  );
}

// ==========================================
// COMPONENTE PRINCIPAL
// ==========================================

export default function GameRoom({ gameId, roomId, session, profile, onLeave }: GameRoomProps) {
  const { t } = useTranslation();

  // ── Estado local ──────────────────────────────────────────────────────────
  const [game,         setGame]         = useState<BlockchainGameState | null>(null);
  const [nextGame,     setNextGame]     = useState<BlockchainGameState | null>(null);
  const [playerTickets,setPlayerTickets]= useState<Array<{ id: string; matrix: number[] }>>([]);
  const [room,         setRoom]         = useState<EnrichedRoom | null>(null);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [showPatterns, setShowPatterns] = useState(true);
  const [showChat,     setShowChat]     = useState(false);
  const [loadingGame,  setLoadingGame]  = useState(true);
  const [now,          setNow]          = useState(Date.now());
  const [maxBalls,     setMaxBalls]     = useState(75);
  const [gamePatterns, setGamePatterns] = useState<Pattern[]>([]);
  const density                         = 'comfortable' as const;

  const AUTO_LOCK_SEC = 60;

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const timeRemaining = useMemo(() => {
    if (!game) return '';
    if (game.status === 'funding') {
      const closeAt = Number(game.game_id) + AUTO_LOCK_SEC * 1000;
      const diff = closeAt - now;
      if (diff <= 0) return '🔒 Fechando...';
      const s = Math.ceil(diff / 1000);
      if (s < 60) return `🔒 ${s}s`;
      return `🔒 ${Math.floor(s / 60)}m ${s % 60}s`;
    }
    return '';
  }, [game, now]);

  const nextGameTimer = useMemo(() => {
    if (!nextGame || nextGame.status !== 'funding') return '';
    const closeAt = Number(nextGame.game_id) + AUTO_LOCK_SEC * 1000;
    const diff = closeAt - now;
    if (diff <= 0) return '0s';
    const s = Math.ceil(diff / 1000);
    if (s < 60) return `${s}s`;
    return `${Math.floor(s / 60)}m ${s % 60}s`;
  }, [nextGame, now]);

  const gameStatusText = useMemo(() => {
    if (!game) return '';
    const emoji: Record<string, string> = { created: '🕐', funding: '🟢', locked: '🔒', drawing: '🎲', drawn: '✅', archived: '📁', aborted: '❌' };
    return `${emoji[game.status] ?? ''} ${game.status}`;
  }, [game]);

  // ── WebSocket (Slow Reveal) ───────────────────────────────────────────────
  const {
    drawnBalls, lastBall, isDrawing, winners, isAborted, abortReason, wsStatus,
    isGameEnded, goldenBall, clearedStages, drawMode,
  } = useSlowReveal(gameId);

  // drawnBalls é DrawnBall[] → extraímos os números
  const drawnNumbers = useMemo(
    () => drawnBalls.map(b => b.number),
    [drawnBalls],
  );
  const drawnSet   = useMemo(() => new Set(drawnNumbers), [drawnNumbers]);
  const lastDrawn  = lastBall?.number ?? null;

  // constrói mapa ticket_id → prize + patternName a partir dos eventos winner_found
  const winnerMap = useMemo(() => {
    const map = new Map<string, { prize: string; patternName: string }>();
    for (const w of winners) {
      if (!map.has(w.ticket_id)) {
        map.set(w.ticket_id, {
          prize: w.payouts.join(', '),
          patternName: w.win_pattern,
        });
      }
    }
    return map;
  }, [winners]);

  // lookup de Pattern pelo nome
  const patternByName = useMemo(() => {
    const map = new Map<string, Pattern>();
    for (const p of gamePatterns) map.set(p.name, p);
    return map;
  }, [gamePatterns]);

  // contagem de cartelas que completaram cada padrão
  const patternWinCount = useMemo(() => {
    const count = new Map<string, number>();
    for (const w of winners) {
      count.set(w.win_pattern, (count.get(w.win_pattern) || 0) + 1);
    }
    return count;
  }, [winners]);

  // patterns ordenados por nº de cartelas que completaram (decrescente)

  // ── Cartelas ordenadas ──────────────────────────────────────────────────
  const sortedTickets = useMemo(() => {
    if (playerTickets.length === 0) return playerTickets;
    return [...playerTickets].sort((a, b) => {
      const wA = winnerMap.get(a.id);
      const wB = winnerMap.get(b.id);

      // Vencedores primeiro, ordenados por prêmio decrescente
      if (wA && !wB) return -1;
      if (!wA && wB) return 1;
      if (wA && wB) {
        const pA = parseFloat(wA.prize) || 0;
        const pB = parseFloat(wB.prize) || 0;
        return pB - pA;
      }

      // Demais: proximidade ponderada + células marcadas
      const proxA = computeProximityScore(a.matrix, drawnSet, gamePatterns);
      const proxB = computeProximityScore(b.matrix, drawnSet, gamePatterns);
      if (proxA !== proxB) return proxB - proxA;
      const marksA = a.matrix.filter(n => drawnSet.has(n)).length + 1;
      const marksB = b.matrix.filter(n => drawnSet.has(n)).length + 1;
      return marksB - marksA;
    });
  }, [playerTickets, drawnSet, winnerMap, gamePatterns]);

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
        const rows: Array<{ ticket_id: string; matrix: number[] | string }> = [];
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

      const [gameRes, allTickets] = await Promise.all([
        session.client.v1.chain.get_table_rows({
          code: CONTRACT, scope: CONTRACT, table: 'games',
          lower_bound: UInt64.from(gameId), upper_bound: UInt64.from(gameId), limit: 1, json: true,
        }),
        fetchAllTickets(),
      ]);
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
        // Busca os patterns deste gametype
        try {
          const patterns = await fetchGamePatterns(session, String(gametypeId));
          if (patterns.length) setGamePatterns(patterns);
        } catch { /* patterns indisponíveis */ }
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
          id:     r.ticket_id,
          matrix: Array.isArray(r.matrix) ? r.matrix : parseHexMatrix(r.matrix as string),
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
  // patterns ordenados por nº de cartelas que completaram (decrescente)
  const sortedPatterns = useMemo(() => {
    return [...roomPatterns].sort((a, b) => {
      const aWins = patternWinCount.get(a.name) || 0;
      const bWins = patternWinCount.get(b.name) || 0;
      return bWins - aWins;
    });
  }, [roomPatterns, patternWinCount]);

  const hasBanners   = !!goldenBall || clearedStages.length > 0 || isGameEnded;

  return (
    <div className="gr-shell">

      {/* ── Navbar ─────────────────────────────────────────────────────────── */}
      <header className="gr-navbar">
        <div className="gr-nav-left">
          <button className="cb-btn cb-btn-ghost cb-btn-sm" onClick={onLeave}>
            {t('game_room.back_to_lobby')}
          </button>
          <div className="gr-nav-crumb">
            <span className="sep">/</span>
            <span style={{ color: 'var(--cb-text-tertiary)' }}>{t('game_room.breadcrumb_room')}</span>
            <span className="room">
              {room?.metadata?.name ?? (room ? `Sala ${room.room_id}` : `#${gameId}`)}
            </span>
            {game && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary]">
                #{gameId}
              </span>
            )}
            {game && (
              <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-full bg-[--cb-bg-elevated] border border-[--cb-border-default] text-[--cb-text-secondary]">
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
        <div className="gr-nav-right">
          {room?.metadata?.chat_enabled !== false && (
            <button
              className={`cb-btn cb-btn-sm ${showChat ? 'cb-btn-primary' : 'cb-btn-ghost'}`}
              onClick={() => setShowChat(s => !s)}
              aria-label="Chat da sala"
            >
              💬 Chat
            </button>
          )}
          <span className="cb-wallet-chip">
            <span style={{ color: 'var(--cb-brand)' }} aria-hidden="true">◆</span>
            <span style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.7rem' }}>
              {profile.wallet_address}
            </span>
          </span>
          <span
            className={`cb-status-dot ${wsStatusClass[wsStatus] ?? 'cb-status-dot-offline'}`}
            title={t('game_room.ws_title', { status: wsStatus })}
            aria-label={t('game_room.ws_aria', { status: wsStatus })}
          />
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
                  className="gr-ball-hero"
                  role="status"
                  aria-live="polite"
                  aria-atomic="true"
                  aria-label={lastDrawn != null ? t('game_room.hero_ball_aria', { number: lastDrawn, count: drawnNumbers.length }) : t('game_room.hero_ball_waiting')}
                >
                  <div className="ball-surface" aria-hidden="true" />
                  <span className="ball-letter">{col}</span>
                  <span className="ball-number">{lastDrawn ?? '—'}</span>
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
                <div ref={seqRef} className="gr-sequence" aria-label={t('game_room.history_aria')}>
                  {[...drawnBalls].reverse().map((ball, idx) => {
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
            <aside ref={patternsRef} className="gr-patterns" aria-label={t('game_room.patterns_heading')}>
              <div className="gr-patterns-head">
                <span className="title">{t('game_room.patterns_heading')}</span>
                <button
                  className="cb-btn cb-btn-ghost cb-btn-sm"
                  onClick={() => setShowPatterns(false)}
                  aria-label={t('game_room.patterns_hide_aria')}
                >✕</button>
              </div>
              <div className="gr-patterns-list">
                {loadingGame ? (
                  <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                    {t('game_room.patterns_loading')}
                  </div>
                ) : roomPatterns.length === 0 ? (
                  <div className="gr-summary-empty" style={{ margin: '0.5rem 0' }}>
                    {t('game_room.patterns_empty')}
                  </div>
                ) : (
                  sortedPatterns.map(p => {
                    const patternWon = winners.some(w => w.win_pattern === p.name);
                    const winCount = patternWinCount.get(p.name) || 0;
                    return (
                      <div key={p.name} className={`gr-pattern${patternWon ? ' is-close' : ''}`}>
                        <div className="gr-pattern-mini">
                          {p.cells.map((on, j) => (
                            <i key={j} className={on ? 'on' : ''} />
                          ))}
                        </div>
                        <div className="gr-pattern-info">
                          <span className="name">{p.name}</span>
                          <div className="mini-progress">
                            <i style={{ width: patternWon ? '100%' : '0%' }} />
                          </div>
                          <span className="meta">
                            {patternWon
                              ? `${t('game_room.pattern_completed')} (${winCount})`
                              : `${p.cells.filter(Boolean).length} cells`}
                          </span>
                        </div>
                        <div className="gr-pattern-prize">
                          <span className="amt">{p.prize}</span>
                          <span className="hits">WAX</span>
                        </div>
                      </div>
                    );
                  })
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
            {isGameEnded && (
              <div className="gr-ended-banner" role="status" aria-live="polite">
                <span className="gr-ended-icon">🏁</span>
                <div className="gr-ended-text">
                  <strong>{t('game_room.game_ended_title')}</strong>
                  <span>
                    {winners.length > 0
                      ? t('game_room.game_ended_winners', { count: winners.length })
                      : t('game_room.game_ended_no_winners')}
                  </span>
                  {nextGame && nextGame.status === 'funding' ? (
                    <span className="gr-ended-next">
                      {t('game_room.next_game_funding', { time: nextGameTimer })}
                    </span>
                  ) : (
                    <span className="gr-ended-next">{t('game_room.game_ended_next')}</span>
                  )}
                </div>
                {nextGame && nextGame.status === 'funding' && (
                  <button
                    className="cb-btn cb-btn-primary cb-btn-sm"
                    onClick={onLeave}
                  >
                    {t('game_room.go_to_next')}
                  </button>
                )}
              </div>
            )}

          </div>
        )}

        {/* ── Cartelas ──────────────────────────────────────────────────────── */}
        <div className="gr-tickets-section">
          <div className="gr-tickets-head">
            <span className="title">
              {t('game_room.my_tickets_heading')}
              <span className="count">{playerTickets.length}</span>
            </span>
            {game?.status === 'funding' && ticketPrice && (
              <button
                className="cb-btn cb-btn-primary cb-btn-sm"
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
            <div className="gr-tickets-grid">
              {sortedTickets.map(ticket => {
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
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Chat Panel ─────────────────────────────────────────────────────── */}
      {showChat && room && (
        <ChatPanel
          roomId={room.room_id}
          roomName={room.metadata?.name ?? `Sala #${room.room_id}`}
          session={session}
          walletAddress={profile.wallet_address}
          onClose={() => setShowChat(false)}
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
