// GameRoom — the live drawing experience (multi-ticket).
// Components: NavBar, BallStage, TicketCard, TicketsSection, PatternPanel,
//             GameRoomDesktop, GameRoomMobile.

const { useState, useEffect, useRef, useMemo, useCallback } = React;

// ── Game data ────────────────────────────────────────────────────────────────

const BINGO_COLORS = {
  B: 'var(--color-bingo-b)',
  I: 'var(--color-bingo-i)',
  N: 'var(--color-bingo-n)',
  G: 'var(--color-bingo-g)',
  O: 'var(--color-bingo-o)',
};

function getCol(n) {
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}

// Player tickets — 24 numbers per matrix (FREE at row 2 col 2 implicit)
// Layout: B[0..4], I[0..4], N[0,1,3,4] (skip FREE), G[0..4], O[0..4]
// Tuned so 6 tickets win 5 distinct patterns after 30 balls drawn,
// showcasing the "multiple winners / multiple patterns" end-state.
const PLAYER_TICKETS = [
  // 4291 → wins DIAG_TR_BL (100W, highest of multiple wins)
  { id: '4291', matrix: [3,8,14,11,5, 17,22,25,28,19, 33,39,36,44, 47,51,58,49,54, 64,71,67,73,68] },
  // 4292 → wins ROW_0 (50W)
  { id: '4292', matrix: [12,8,13,4,5, 29,16,22,27,24, 42,38,36,43, 47,55,49,56,60, 71,70,73,65,66] },
  // 4293 → wins ROW_0 (50W) — two cartelas hitting the same pattern
  { id: '4293', matrix: [8,7,6,10,15, 17,19,20,23,26, 33,40,35,41, 58,53,55,48,60, 64,69,70,72,66] },
  // 4294 → wins COL_N (60W)
  { id: '4294', matrix: [11,2,6,15,9, 20,27,16,23,30, 42,39,36,31, 50,54,60,53,57, 70,65,68,74,66] },
  // 4295 → wins ROW_2 (50W)
  { id: '4295', matrix: [13,7,14,2,9, 21,27,25,30,23, 38,40,35,41, 60,54,58,50,57, 69,65,62,70,66] },
  // 4296 → wins DIAG_TL_BR (100W)
  { id: '4296', matrix: [3,10,15,2,13, 16,22,27,21,24, 40,38,41,32, 50,60,55,49,57, 69,70,68,65,75] },
];

// The drawn sequence — deterministic.
// First 10 draws complete Row 0 of ticket 4291.
const DRAW_SEQUENCE = [
  12, 29, 47, 3, 71, 42, 58, 17, 33, 64,
  8, 22, 51, 39, 67, 14, 28, 44, 56, 73,
  5, 36, 49, 25, 62, 1, 18, 31, 46, 75,
];

// Build 5x5 display grid (FREE at [2][2]) from a 24-length matrix.
function buildGrid(matrix) {
  const B = matrix.slice(0, 5);
  const I = matrix.slice(5, 10);
  const Nraw = matrix.slice(10, 14);
  const G = matrix.slice(14, 19);
  const O = matrix.slice(19, 24);
  const N = [Nraw[0], Nraw[1], null, Nraw[2], Nraw[3]];
  return Array.from({ length: 5 }, (_, r) => [B[r], I[r], N[r], G[r], O[r]]);
}

// Matrix index → row-major grid index. Matrix is column-major.
function matrixIdxToGridIdx(i) {
  if (i <= 4)  return i * 5 + 0;             // B col → col 0
  if (i <= 9)  return (i - 5) * 5 + 1;       // I col → col 1
  if (i <= 13) return [2, 7, 17, 22][i - 10]; // N col (skip FREE)
  if (i <= 18) return (i - 14) * 5 + 3;      // G col → col 3
  return (i - 19) * 5 + 4;                   // O col → col 4
}

// Map a ball number → grid index on a given matrix. -1 if not on ticket.
function ticketGridIndex(n, matrix) {
  const i = matrix.indexOf(n);
  return i === -1 ? -1 : matrixIdxToGridIdx(i);
}

// Patterns — 5x5 bitmasks
function mkMask(cells) {
  const m = Array(25).fill(false);
  cells.forEach(i => m[i] = true);
  return m;
}
const PATTERNS = [
  { id: 'ROW_0', name: 'Linha 1', cells: [0,1,2,3,4], prize: 50 },
  { id: 'ROW_1', name: 'Linha 2', cells: [5,6,7,8,9], prize: 50 },
  { id: 'ROW_2', name: 'Linha 3', cells: [10,11,12,13,14], prize: 50 },
  { id: 'COL_N', name: 'Coluna N', cells: [2,7,12,17,22], prize: 60 },
  { id: 'DIAG_TL_BR', name: 'Diagonal ↘', cells: [0,6,12,18,24], prize: 100 },
  { id: 'DIAG_TR_BL', name: 'Diagonal ↙', cells: [4,8,12,16,20], prize: 100 },
  { id: 'FOUR_CORNERS', name: '4 Cantos', cells: [0,4,20,24], prize: 80 },
  { id: 'FULL_HOUSE', name: 'Cartela Cheia', cells: Array.from({length:25}, (_,i)=>i), prize: 850 },
].map(p => ({ ...p, mask: mkMask(p.cells) }));

const PATTERN_LABELS = Object.fromEntries(PATTERNS.map(p => [p.id, p.name]));

// ── useLiveGame ──────────────────────────────────────────────────────────────

function useLiveGame({ playing, speedMs, startAt = 0, maxBalls = DRAW_SEQUENCE.length }) {
  const [drawnOrder, setDrawnOrder] = useState(startAt);
  const drawnRef = useRef(startAt);

  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      if (drawnRef.current >= maxBalls) return;
      drawnRef.current = Math.min(maxBalls, drawnRef.current + 1);
      setDrawnOrder(drawnRef.current);
    }, speedMs);
    return () => clearInterval(id);
  }, [playing, speedMs, maxBalls]);

  const drawnBalls = DRAW_SEQUENCE.slice(0, drawnOrder);
  const lastBall = drawnOrder > 0 ? DRAW_SEQUENCE[drawnOrder - 1] : null;
  const drawnSet = useMemo(() => new Set(drawnBalls), [drawnOrder]);

  return { drawnOrder, drawnBalls, lastBall, drawnSet };
}

// ── useTicketsState — per-ticket marked + per-ticket pattern progress ────────

function useTicketsState(tickets, drawnBalls) {
  return useMemo(() => {
    return tickets.map(ticket => {
      const marked = new Set([12]);
      for (const n of drawnBalls) {
        const i = ticket.matrix.indexOf(n);
        if (i !== -1) marked.add(matrixIdxToGridIdx(i));
      }
      const patternState = PATTERNS.map(p => {
        const hit = p.cells.filter(c => marked.has(c)).length;
        const total = p.cells.length;
        const remaining = total - hit;
        const won = remaining === 0;
        return { ...p, hit, total, remaining, won, close: !won && remaining <= 1 };
      });
      const wonPatterns = patternState.filter(p => p.won);
      // Highest-prize win = ticket's actual payout (game rule)
      const payoutPattern = wonPatterns.sort((a, b) => b.prize - a.prize)[0] || null;
      // For UI, "winning pattern" = best non-FULL_HOUSE win (visual highlight)
      const winningPattern = payoutPattern;
      const bestPattern = [...patternState].sort((a,b) => {
        if (a.won !== b.won) return a.won ? -1 : 1;
        return a.remaining - b.remaining;
      })[0];
      const grid = buildGrid(ticket.matrix);
      return { ...ticket, grid, marked, patternState, winningPattern, payoutPattern, bestPattern };
    });
  }, [tickets, drawnBalls.length]);
}

// Compute the player's payouts grouped by pattern (each ticket pays its
// highest-prize won pattern only — game rule).
function computePlayerPayouts(ticketsState) {
  const byPattern = new Map();
  let totalPayout = 0;
  let totalWinningTickets = 0;
  for (const t of ticketsState) {
    if (!t.payoutPattern) continue;
    const p = t.payoutPattern;
    totalPayout += p.prize;
    totalWinningTickets++;
    if (!byPattern.has(p.id)) {
      byPattern.set(p.id, {
        id: p.id, name: p.name, mask: p.mask, prize: p.prize,
        count: 0, total: 0, ticketIds: [],
      });
    }
    const entry = byPattern.get(p.id);
    entry.count++;
    entry.total += p.prize;
    entry.ticketIds.push(t.id);
  }
  const grouped = [...byPattern.values()].sort((a, b) => b.total - a.total);
  return { totalPayout, totalWinningTickets, grouped };
}

// Aggregate patterns across all tickets — for the side panel.
function aggregatePatterns(ticketsState) {
  return PATTERNS.map((p, i) => {
    let bestHit = 0;
    let bestRemaining = p.cells.length;
    let bestTicketId = null;
    let winnersCount = 0;
    let closeCount = 0;
    let progressedCount = 0; // tickets with at least one hit
    for (const t of ticketsState) {
      const ps = t.patternState[i];
      if (ps.won) winnersCount++;
      else if (ps.remaining === 1) closeCount++;
      if (ps.hit > 0) progressedCount++;
      if (ps.hit > bestHit || bestTicketId === null) {
        bestHit = ps.hit;
        bestRemaining = ps.remaining;
        bestTicketId = t.id;
      }
    }
    return {
      ...p,
      hit: bestHit,
      total: p.cells.length,
      remaining: bestRemaining,
      won: bestRemaining === 0,
      close: bestRemaining <= 1 && bestRemaining > 0,
      bestTicketId,
      winnersCount,
      closeCount,
      progressedCount,
    };
  });
}

// ── NavBar ───────────────────────────────────────────────────────────────────

function NavBar({ roomId, walletShort, balance, theme, onToggleTheme, isLive }) {
  return (
    <header className="gr-navbar">
      <div className="gr-nav-left">
        <a href="#" className="cb-logo">Crypto<span>Bingo</span></a>
        <div className="gr-nav-crumb">
          <span className="sep">/</span>
          <span style={{ color: 'var(--cb-text-tertiary)' }}>Sala</span>
          <span className="room">#{roomId}</span>
          {isLive && <span className="gr-live">Ao Vivo</span>}
        </div>
      </div>
      <div className="gr-nav-right">
        <span className="cb-wallet-chip">
          <span style={{ color: 'var(--cb-brand)' }}>◆</span>
          {walletShort}
        </span>
        <span className="cb-badge-accent" style={{ fontFamily: 'var(--font-family-mono)', fontSize: '0.8rem' }}>
          {balance.toFixed(4)} WAX
        </span>
        <button
          className="cb-theme-toggle"
          onClick={onToggleTheme}
          aria-label="Alternar tema"
          title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
        >
          {theme === 'dark' ? '☾' : '☀'}
        </button>
      </div>
    </header>
  );
}

// ── BallStage ────────────────────────────────────────────────────────────────

function BallStage({ lastBall, drawnBalls, ticketsState, stageStyle = 'spotlight', showHalo = true, winning = null, winnerTicketId = null }) {
  const heroRef = useRef(null);
  const seqRef = useRef(null);
  const prevOrderRef = useRef(0);

  useEffect(() => {
    if (!heroRef.current) return;
    if (drawnBalls.length !== prevOrderRef.current && lastBall != null) {
      prevOrderRef.current = drawnBalls.length;
      const el = heroRef.current;
      el.classList.remove('gr-drop');
      void el.offsetWidth;
      el.classList.add('gr-drop');
    }
  }, [drawnBalls.length]);

  useEffect(() => {
    if (seqRef.current) seqRef.current.scrollLeft = seqRef.current.scrollWidth;
  }, [drawnBalls.length]);

  const col = lastBall != null ? getCol(lastBall) : 'B';
  const color = lastBall != null ? BINGO_COLORS[col] : 'var(--cb-brand)';

  // Compute "matched" = ball hit at least one ticket
  const matchedOn = useMemo(() => {
    const s = new Set();
    for (const t of ticketsState) {
      for (const n of drawnBalls) {
        if (t.matrix.indexOf(n) !== -1) s.add(n);
      }
    }
    return s;
  }, [ticketsState, drawnBalls.length]);

  return (
    <section
      className="gr-stage"
      data-stage-style={stageStyle}
      aria-label="Sorteio em tempo real"
    >
      <div className="gr-stage-header">
        <span className="gr-stage-label">🎱 Última Bola</span>
        <span style={{ display:'flex', alignItems:'center', gap:'0.5rem', fontSize:'0.75rem', color:'var(--cb-text-tertiary)' }}>
          <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
          <span style={{ fontWeight: 600, color: 'var(--cb-text-secondary)' }}>Conectado</span>
        </span>
      </div>

      <div className="gr-stage-body">
        <div className="gr-stage-spot" style={{ '--ball-color': color }}>
          {showHalo && <div className="gr-ball-halo" />}

          {lastBall != null ? (
            <React.Fragment>
              <div
                ref={heroRef}
                className="gr-ball-hero gr-drop"
                aria-live="polite"
                aria-atomic="true"
                aria-label={`Bola ${col}${lastBall}, número ${drawnBalls.length} de 75`}
              >
                <div className="ball-surface" />
                <span className="ball-letter">{col}</span>
                <span className="ball-number">{lastBall}</span>
                <span className="ball-order">#{drawnBalls.length}/75</span>
              </div>

              <div className="gr-call">
                <span className="col-tag">{col}</span>
                <span style={{ opacity: 0.55, fontWeight: 400 }}>—</span>
                <span>{lastBall}</span>
              </div>
            </React.Fragment>
          ) : (
            <div style={{ textAlign:'center', color:'var(--cb-text-tertiary)' }}>
              <div style={{ fontSize:'3rem' }} aria-hidden="true">⏳</div>
              <p style={{ marginTop:'0.5rem' }}>Aguardando primeira bola...</p>
            </div>
          )}

          {winning && (
            <div className="gr-winner-banner" role="status" aria-live="polite">
              <ConfettiBurst />
              <span className="trophy" aria-hidden="true">🏆</span>
              <span className="title">BINGO!</span>
              <span className="pattern-name">{PATTERN_LABELS[winning.id] ?? winning.name}</span>
              <span className="who">
                jogador1.wax{winnerTicketId ? ` · cartela #${winnerTicketId}` : ''}
              </span>
              <span className="prize">
                <span aria-hidden="true">◆</span> {winning.prize.toFixed(4)} WAX
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="gr-stage-footer">
        <div className="gr-progress">
          <div className="gr-progress-row">
            <span>Bolas reveladas</span>
            <span className="count">
              {drawnBalls.length}<span style={{ fontWeight: 400, opacity: 0.5 }}>/75</span>
            </span>
          </div>
          <div
            className="cb-progress-track"
            role="progressbar"
            aria-valuemin={0} aria-valuemax={75} aria-valuenow={drawnBalls.length}
          >
            <div className="cb-progress-fill" style={{ width: `${(drawnBalls.length / 75) * 100}%` }} />
          </div>
        </div>

        <div className="gr-sequence" ref={seqRef} aria-label="Histórico de bolas">
          {drawnBalls.map((n, i) => {
            const c = getCol(n);
            const matched = matchedOn.has(n);
            const isLast = i === drawnBalls.length - 1;
            return (
              <span
                key={`${n}-${i}`}
                className={`gr-mini-ball${isLast ? ' latest' : ''}${matched ? ' matched' : ''}`}
                style={{ '--ball-color': BINGO_COLORS[c] }}
                title={`${c}${n}${matched ? ' — em alguma cartela' : ''}`}
              >
                {n}
              </span>
            );
          })}
        </div>
      </div>
    </section>
  );
}

// ── RoundSummary — end-of-round payout aggregation ──────────────────────────

function RoundSummary({ payouts, drawnCount, totalTickets }) {
  const { totalPayout, totalWinningTickets, grouped } = payouts;
  const won = grouped.length > 0;

  return (
    <section
      className="gr-stage gr-summary-stage"
      data-stage-style="spotlight"
      aria-label="Resumo da rodada"
    >
      <div className="gr-stage-header">
        <span className="gr-stage-label">🏆 Rodada Encerrada</span>
        <span style={{ fontSize: '0.72rem', color: 'var(--cb-text-tertiary)', fontFamily: 'var(--font-family-mono)' }}>
          G-2147 · {drawnCount}/75 bolas
        </span>
      </div>

      <div className="gr-summary-body">
        <div className="gr-summary-hero">
          <span className="trophy" aria-hidden="true">🏆</span>
          <span className="eyebrow">Você ganhou</span>
          <span className="total" aria-live="polite">
            {totalPayout.toFixed(4)}
            <span className="unit">WAX</span>
          </span>
          <span className="sub">
            {totalWinningTickets} de {totalTickets} cartelas premiadas
          </span>
        </div>

        {won ? (
          <div className="gr-summary-list" role="list">
            <div className="gr-summary-list-head">
              <span>Padrão</span>
              <span>Cartelas</span>
              <span>Total</span>
            </div>
            {grouped.map((g, i) => (
              <div key={g.id} className="gr-summary-row" role="listitem">
                <div className="gr-summary-pattern">
                  <div className="gr-pattern-mini is-summary" aria-hidden="true">
                    {g.mask.map((on, j) => <i key={j} className={on ? 'on' : ''} />)}
                  </div>
                  <div className="gr-summary-pattern-info">
                    <span className="name">
                      {i === 0 && <span className="rank-medal" aria-hidden="true">🥇</span>}
                      {i === 1 && <span className="rank-medal" aria-hidden="true">🥈</span>}
                      {i === 2 && <span className="rank-medal" aria-hidden="true">🥉</span>}
                      {g.name}
                    </span>
                    <span className="per">
                      {g.prize}W <span className="x">×</span> {g.count}
                    </span>
                  </div>
                </div>
                <div className="gr-summary-tickets">
                  {g.ticketIds.slice(0, 4).map(id => (
                    <span key={id} className="ticket-chip">#{id}</span>
                  ))}
                  {g.ticketIds.length > 4 && (
                    <span className="ticket-chip more">+{g.ticketIds.length - 4}</span>
                  )}
                </div>
                <div className="gr-summary-amount">{g.total}<span className="unit">W</span></div>
              </div>
            ))}
          </div>
        ) : (
          <div className="gr-summary-empty">
            <p>Nenhum padrão completado nesta rodada.</p>
          </div>
        )}
      </div>

      <div className="gr-summary-foot">
        <span className="legal">
          Pagamento automático on-chain · Hash: <span className="hash">0x4af2…b1c9</span>
        </span>
        <button className="cb-btn cb-btn-accent" type="button">
          Reclamar {totalPayout.toFixed(2)} WAX
        </button>
      </div>
    </section>
  );
}

const CONFETTI_COLORS = [
  'var(--color-bingo-b)', 'var(--color-bingo-i)', 'var(--color-bingo-n)',
  'var(--color-bingo-g)', 'var(--color-bingo-o)',
  'var(--color-accent-400)', 'var(--color-accent-300)',
];

function ConfettiBurst({ count = 28 }) {
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    i,
    left: `${Math.random() * 100}%`,
    bg: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${Math.random() * 1.6}s`,
    dx: `${(Math.random() - 0.5) * 200}px`,
    rot: Math.random() * 90,
  })), [count]);
  return (
    <React.Fragment>
      {pieces.map(p => (
        <span
          key={p.i}
          className="gr-confetti"
          style={{
            left: p.left, background: p.bg, animationDelay: p.delay,
            transform: `rotate(${p.rot}deg)`, '--dx': p.dx,
          }}
          aria-hidden="true"
        />
      ))}
    </React.Fragment>
  );
}

// ── TicketCard ───────────────────────────────────────────────────────────────

function TicketCard({ ticket, lastBall, isWinner, endedMode = false }) {
  const lastHitNumberRef = useRef(null);
  const justHitIndex = useMemo(() => {
    if (lastBall == null || lastBall === lastHitNumberRef.current) return -1;
    lastHitNumberRef.current = lastBall;
    return ticketGridIndex(lastBall, ticket.matrix);
  }, [lastBall, ticket.matrix]);

  const winningCells = ticket.winningPattern ? new Set(ticket.winningPattern.cells) : null;
  const markedCount = ticket.marked.size;
  const best = ticket.bestPattern;
  const payout = ticket.payoutPattern;
  const isClose = best && best.close && !isWinner;

  return (
    <article
      className={`gr-ticket${isWinner ? ' is-winner' : ''}${endedMode && !isWinner ? ' is-dimmed' : ''}`}
      aria-label={`Cartela ${ticket.id}, ${markedCount} de 25 marcados`}
    >
      <header className="gr-ticket-header">
        <div className="gr-ticket-id">
          <span className="label">#</span>
          <span className="id">{ticket.id}</span>
        </div>
        <span className={`gr-ticket-marks${isClose ? ' is-close' : ''}${isWinner ? ' is-winner' : ''}`}>
          {isWinner
            ? <React.Fragment><span aria-hidden="true">🏆</span> {payout.prize}W</React.Fragment>
            : <React.Fragment>{markedCount}<span style={{ opacity: 0.4 }}>/25</span></React.Fragment>}
        </span>
      </header>

      <div className="gr-bingo-grid" role="grid" aria-label="Cartela de bingo 5 por 5">
        <div className="gr-bingo-grid-head" role="row">
          {['B','I','N','G','O'].map(c => (
            <div
              key={c}
              className="gr-bingo-head"
              style={{ background: BINGO_COLORS[c] }}
              aria-label={`Coluna ${c}`}
            >
              {c}
            </div>
          ))}
        </div>

        <div className="gr-bingo-grid-body">
          {ticket.grid.map((row, rIdx) => (
            <div className="gr-bingo-row" role="row" key={rIdx}>
              {row.map((cell, cIdx) => {
                const gridIdx = rIdx * 5 + cIdx;
                const isFree = cell === null;
                const isMarked = isFree || ticket.marked.has(gridIdx);
                const isJustHit = gridIdx === justHitIndex && isMarked;
                const inWinPattern = winningCells?.has(gridIdx) && isMarked;
                const colKey = ['B','I','N','G','O'][cIdx];

                const cls = [
                  'gr-bingo-cell',
                  isFree ? 'is-free' : '',
                  !isFree && isMarked ? 'is-marked' : '',
                  isJustHit ? 'is-just-hit' : '',
                  inWinPattern ? 'in-winning-pattern' : '',
                ].filter(Boolean).join(' ');

                return (
                  <div
                    key={cIdx}
                    className={cls}
                    role="gridcell"
                    aria-selected={isMarked}
                    aria-label={isFree ? 'Espaço livre' : `Número ${cell}${isMarked ? ', marcado' : ''}`}
                    style={{ '--cell-color': BINGO_COLORS[colKey] }}
                  >
                    {isFree ? '★' : cell}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <footer className="gr-ticket-foot">
        {isWinner ? (
          <React.Fragment>
            <span className="best winner-pattern" title={payout.name}>
              <b style={{ color: 'var(--cb-accent)' }}>{payout.name}</b>
            </span>
            <span className="prize is-paid">+{payout.prize}W</span>
          </React.Fragment>
        ) : endedMode ? (
          <React.Fragment>
            <span className="best">não premiada</span>
            <span className="prize" style={{ color: 'var(--cb-text-tertiary)' }}>—</span>
          </React.Fragment>
        ) : best && best.remaining <= 2 ? (
          <React.Fragment>
            <span className="best" title={best?.name}>
              <b>{best.name}</b>
              <span>· falta {best.remaining}</span>
            </span>
            <span className="prize">{best.prize}W</span>
          </React.Fragment>
        ) : best ? (
          <React.Fragment>
            <span className="best" title={best?.name}>
              <b>{best.name}</b>
              <span>· {best.hit}/{best.total}</span>
            </span>
            <span className="prize">{best.prize}W</span>
          </React.Fragment>
        ) : null}
      </footer>
    </article>
  );
}

// ── TicketsSection ───────────────────────────────────────────────────────────

function TicketsSection({ ticketsState, lastBall, endedMode = false }) {
  // Sort: winners first, then by closeness to a win, then by id
  const sorted = useMemo(() => {
    return [...ticketsState].sort((a, b) => {
      const aw = !!a.winningPattern, bw = !!b.winningPattern;
      if (aw !== bw) return aw ? -1 : 1;
      // In ended mode, sort by payout prize among winners
      if (aw && bw) return (b.payoutPattern?.prize ?? 0) - (a.payoutPattern?.prize ?? 0);
      return (a.bestPattern?.remaining ?? 99) - (b.bestPattern?.remaining ?? 99);
    });
  }, [ticketsState]);

  const totalWon = ticketsState.filter(t => t.winningPattern).length;

  return (
    <section className="gr-tickets-section" aria-label="Suas cartelas">
      <header className="gr-tickets-head">
        <span className="title">
          {endedMode ? 'Suas Cartelas — Resultado' : 'Suas Cartelas'}
          <span className="count">{ticketsState.length}</span>
          <span style={{ color: 'var(--cb-text-tertiary)', fontWeight: 500, letterSpacing: 0, textTransform: 'none', fontSize: '0.75rem' }}>
            {endedMode ? 'após sorteio' : 'ativas nesta rodada'}
          </span>
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
          {totalWon > 0 && (
            <span className="cb-badge-accent" style={{ animation: endedMode ? 'none' : 'cb-pulse 1.8s ease-in-out infinite' }}>
              🏆 {totalWon} premiada{totalWon > 1 ? 's' : ''}
            </span>
          )}
          {!endedMode && (
            <button className="cb-btn cb-btn-outline cb-btn-sm" type="button">
              + Comprar mais
            </button>
          )}
        </span>
      </header>
      <div className="gr-tickets-grid">
        {sorted.map(t => (
          <TicketCard
            key={t.id}
            ticket={t}
            lastBall={lastBall}
            isWinner={!!t.winningPattern}
            endedMode={endedMode}
          />
        ))}
      </div>
    </section>
  );
}

// ── PatternPanel ─────────────────────────────────────────────────────────────

function PatternPanel({ patterns, ticketsState }) {
  const sorted = [...patterns].sort((a, b) => {
    if (a.won !== b.won) return a.won ? -1 : 1;
    return a.remaining - b.remaining;
  });

  const totalTickets = ticketsState.length;

  return (
    <section className="gr-patterns" aria-label="Padrões pagantes">
      <div className="gr-patterns-head">
        <span className="title">Padrões Pagantes</span>
        <span className="subtitle">{totalTickets} cartelas · melhor progresso</span>
      </div>
      <div className="gr-patterns-list">
        {sorted.map(p => {
          const hasMeta = p.winnersCount > 0 || p.closeCount > 0;
          return (
            <div key={p.id} className={`gr-pattern${p.close ? ' is-close' : ''}`}>
              <div className="gr-pattern-mini" aria-hidden="true">
                {p.mask.map((on, i) => <i key={i} className={on ? 'on' : ''} />)}
              </div>
              <div className="gr-pattern-info">
                <span className="name">{p.name}</span>
                <div className="mini-progress">
                  <i style={{ width: `${(p.hit / p.total) * 100}%` }} />
                </div>
                {hasMeta && (
                  <span className="meta" aria-label="Cartelas próximas">
                    {p.winnersCount > 0 && (
                      <span className="chip is-winner" title={`${p.winnersCount} cartela${p.winnersCount > 1 ? 's' : ''} venceu este padrão`}>
                        <span aria-hidden="true">🏆</span>
                        {p.winnersCount} venceu
                      </span>
                    )}
                    {p.winnersCount > 0 && p.closeCount > 0 && <span className="sep">·</span>}
                    {p.closeCount > 0 && (
                      <span className="chip is-close" title={`${p.closeCount} cartela${p.closeCount > 1 ? 's' : ''} a 1 célula deste padrão`}>
                        <span aria-hidden="true">🎯</span>
                        {p.closeCount} {p.closeCount > 1 ? 'cartelas a 1' : 'cartela a 1'}
                      </span>
                    )}
                  </span>
                )}
              </div>
              <div className="gr-pattern-prize">
                <span className="amt">{p.prize}W</span>
                <span className="hits">
                  {p.won ? 'GANHO!' : p.close ? `falta ${p.remaining}!` : `${p.hit}/${p.total}`}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// ── GameRoomDesktop ──────────────────────────────────────────────────────────

function GameRoomDesktop({
  density = 'comfortable',
  stageStyle = 'spotlight',
  showHalo = true,
  showPatterns = true,
  playing = true,
  speedMs = 1800,
  startAt = 0,
  maxBalls = DRAW_SEQUENCE.length,
  endedMode = false,
  theme = 'dark',
  onToggleTheme,
  artboardId,
}) {
  const { drawnBalls, lastBall } = useLiveGame({ playing, speedMs, startAt, maxBalls });
  const ticketsState = useTicketsState(PLAYER_TICKETS, drawnBalls);
  const aggregated = useMemo(() => aggregatePatterns(ticketsState), [ticketsState]);
  const payouts = useMemo(() => computePlayerPayouts(ticketsState), [ticketsState]);

  const winnerTicket = ticketsState.find(t => t.winningPattern);
  const stageWinning = !endedMode ? (winnerTicket?.winningPattern || null) : null;

  // Status label for the room header strip
  const roomStatus = endedMode ? 'archived'
    : winnerTicket ? 'drawn'
    : drawnBalls.length > 0 ? 'drawing'
    : 'locked';

  const pageHeader = (
    <window.PageHeader
      eyebrow={endedMode ? 'Resumo' : 'Sala em andamento'}
      title={`Sala #G-2147`}
      badges={
        <React.Fragment>
          <span className={`cb-status-${roomStatus}`}>
            {endedMode ? 'Encerrada'
              : roomStatus === 'drawing' ? 'Sorteando'
              : roomStatus === 'drawn'   ? 'Resolvido'
              : 'Travado'}
          </span>
          {!endedMode && (
            <span className="cb-badge-neutral">
              <span style={{ fontFamily: 'var(--font-family-mono)' }}>
                {drawnBalls.length}<span style={{ opacity: 0.5 }}>/75</span> bolas
              </span>
            </span>
          )}
          {!endedMode && (
            <span className="cb-badge-neutral" title="Conexão WebSocket">
              <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
              Conectado
            </span>
          )}
          <span className="cb-badge-brand">{PLAYER_TICKETS.length} cartelas</span>
        </React.Fragment>
      }
      actions={
        <React.Fragment>
          {!endedMode && (
            <button className="cb-btn cb-btn-outline cb-btn-sm">Compartilhar sala</button>
          )}
          <button className="cb-btn cb-btn-ghost cb-btn-sm">← Voltar ao Lobby</button>
        </React.Fragment>
      }
    />
  );

  return (
    <window.SiteLayout
      mode="player"
      section="lobby"
      theme={theme}
      onToggleTheme={onToggleTheme}
      user={{ name: 'jogador1.wax', balance: 234.5832 }}
      pageHeader={pageHeader}
      artboardId={artboardId}
    >
      <div className={`gr-main ${density === 'compact' ? 'gr-compact' : 'gr-comfortable'}`}>
        {endedMode ? (
          <RoundSummary
            payouts={payouts}
            drawnCount={drawnBalls.length}
            totalTickets={ticketsState.length}
          />
        ) : (
          <BallStage
            lastBall={lastBall}
            drawnBalls={drawnBalls}
            ticketsState={ticketsState}
            stageStyle={stageStyle}
            showHalo={showHalo}
            winning={stageWinning}
            winnerTicketId={winnerTicket?.id}
          />
        )}
        {showPatterns && <PatternPanel patterns={aggregated} ticketsState={ticketsState} />}
        <TicketsSection
          ticketsState={ticketsState}
          lastBall={lastBall}
          endedMode={endedMode}
        />
      </div>
    </window.SiteLayout>
  );
}

// ── GameRoomMobile ───────────────────────────────────────────────────────────

function GameRoomMobile({
  stageStyle = 'spotlight',
  showHalo = true,
  showPatterns = true,
  playing = true,
  speedMs = 1800,
  startAt = 0,
  maxBalls = DRAW_SEQUENCE.length,
  theme = 'dark',
  onToggleTheme,
  artboardId,
}) {
  const { drawnBalls, lastBall } = useLiveGame({ playing, speedMs, startAt, maxBalls });
  // Show fewer tickets on mobile for clarity
  const mobileTickets = PLAYER_TICKETS.slice(0, 3);
  const ticketsState = useTicketsState(mobileTickets, drawnBalls);
  const aggregated = useMemo(() => aggregatePatterns(ticketsState), [ticketsState]);

  const [patternsOpen, setPatternsOpen] = useState(false);

  // Compute teaser text for the collapsed patterns bar
  const teaser = useMemo(() => {
    const sorted = [...aggregated].sort((a,b) => {
      if (a.won !== b.won) return a.won ? -1 : 1;
      return a.remaining - b.remaining;
    });
    const top = sorted[0];
    if (!top) return { text: '', isClose: false };
    if (top.winnersCount > 0) return { text: `🏆 ${top.winnersCount} venceu ${top.name}`, isClose: true };
    if (top.closeCount > 0) return { text: `🎯 ${top.closeCount} a 1 de ${top.name}`, isClose: true };
    return { text: `mais próximo: ${top.name} · ${top.hit}/${top.total}`, isClose: false };
  }, [aggregated]);

  const heroRef = useRef(null);
  const prevOrderRef = useRef(0);
  const seqRef = useRef(null);

  useEffect(() => {
    if (!heroRef.current) return;
    if (drawnBalls.length !== prevOrderRef.current && lastBall != null) {
      prevOrderRef.current = drawnBalls.length;
      const el = heroRef.current;
      el.classList.remove('gr-drop');
      void el.offsetWidth;
      el.classList.add('gr-drop');
    }
  }, [drawnBalls.length]);

  useEffect(() => {
    if (seqRef.current) seqRef.current.scrollLeft = seqRef.current.scrollWidth;
  }, [drawnBalls.length]);

  const col = lastBall != null ? getCol(lastBall) : 'B';
  const color = lastBall != null ? BINGO_COLORS[col] : 'var(--cb-brand)';

  // sort tickets — winners first
  const sortedTickets = useMemo(() => {
    return [...ticketsState].sort((a, b) => {
      const aw = !!a.winningPattern, bw = !!b.winningPattern;
      if (aw !== bw) return aw ? -1 : 1;
      return (a.bestPattern?.remaining ?? 99) - (b.bestPattern?.remaining ?? 99);
    });
  }, [ticketsState]);

  return (
    <div className="gr-mobile" data-screen-label={artboardId}>
      <header className="gr-mobile-nav">
        <a href="#" className="cb-logo" style={{ fontSize: '1.05rem' }}>Crypto<span>Bingo</span></a>
        <span style={{ display:'flex', alignItems:'center', gap:'0.4rem' }}>
          <span className="gr-live" style={{ fontSize: '0.6rem' }}>Ao Vivo</span>
          <button
            className="cb-theme-toggle"
            onClick={onToggleTheme}
            style={{ width:'1.85rem', height:'1.85rem', fontSize:'0.85rem' }}
            aria-label="Alternar tema"
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
        </span>
      </header>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0.5rem 1rem 0', fontSize:'0.75rem', color:'var(--cb-text-secondary)' }}>
        <span>Sala <span style={{ fontFamily:'var(--font-family-mono)', color:'var(--cb-text-primary)', fontWeight:600 }}>#G-2147</span></span>
        <span className="cb-wallet-chip" style={{ padding:'0.2rem 0.55rem', fontSize:'0.7rem' }}>
          <span style={{ color:'var(--cb-brand)' }}>◆</span>
          234.58 WAX
        </span>
      </div>

      <div className="gr-mobile-stage" data-stage-style={stageStyle} style={{ '--ball-color': color }}>
        <div className="gr-mobile-stage-inner">
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: '0.5rem' }}>
            <span className="gr-stage-label" style={{ fontSize:'0.65rem' }}>🎱 Última Bola</span>
            <span style={{ fontSize:'0.65rem', color:'var(--cb-text-tertiary)', fontFamily:'var(--font-family-mono)' }}>
              {drawnBalls.length}/75
            </span>
          </div>

          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'0.5rem', position:'relative', padding:'0.5rem 0 0.75rem' }}>
            {showHalo && <div className="gr-ball-halo" style={{ position:'absolute' }} />}
            {lastBall != null && (
              <React.Fragment>
                <div
                  ref={heroRef}
                  className="gr-ball-hero is-mobile gr-drop"
                  aria-label={`Bola ${col}${lastBall}`}
                >
                  <div className="ball-surface" />
                  <span className="ball-letter">{col}</span>
                  <span className="ball-number">{lastBall}</span>
                  <span className="ball-order">#{drawnBalls.length}/75</span>
                </div>
                <div className="gr-call" style={{ fontSize:'0.95rem' }}>
                  <span className="col-tag" style={{ fontSize:'1.15rem' }}>{col}</span>
                  <span style={{ opacity:0.5 }}>—</span>
                  <span>{lastBall}</span>
                </div>
              </React.Fragment>
            )}
          </div>

          <div className="cb-progress-track" style={{ marginTop: '0.5rem' }}>
            <div className="cb-progress-fill" style={{ width: `${(drawnBalls.length / 75) * 100}%` }} />
          </div>

          <div className="gr-sequence" ref={seqRef} style={{ marginTop:'0.75rem' }}>
            {drawnBalls.map((n, i) => {
              const c = getCol(n);
              const matched = ticketsState.some(t => t.matrix.indexOf(n) !== -1);
              const isLast = i === drawnBalls.length - 1;
              return (
                <span
                  key={`${n}-${i}`}
                  className={`gr-mini-ball${isLast ? ' latest' : ''}${matched ? ' matched' : ''}`}
                  style={{ '--ball-color': BINGO_COLORS[c], width:'2.1rem', height:'2.1rem', fontSize:'0.75rem' }}
                >
                  {n}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      <div className="gr-mobile-ticket-wrap">
        {showPatterns && (
          <div className={`gr-mobile-patterns${patternsOpen ? ' is-open' : ''}`}>
            <button
              type="button"
              className="gr-mobile-patterns-toggle"
              onClick={() => setPatternsOpen(o => !o)}
              aria-expanded={patternsOpen}
              aria-controls="mobile-patterns-content"
            >
              <span className="label">🎯 Padrões</span>
              <span className={`teaser${teaser.isClose ? ' is-close' : ''}`}>
                {teaser.text}
              </span>
              <span className="chev" aria-hidden="true">▾</span>
            </button>
            {patternsOpen && (
              <div className="gr-mobile-patterns-content" id="mobile-patterns-content">
                <PatternPanel patterns={aggregated} ticketsState={ticketsState} />
              </div>
            )}
          </div>
        )}
        <section className="gr-tickets-section">
          <header className="gr-tickets-head">
            <span className="title">
              Cartelas
              <span className="count">{ticketsState.length}</span>
            </span>
            <button className="cb-btn cb-btn-outline cb-btn-sm">+ Comprar</button>
          </header>
          <div className="gr-tickets-grid">
            {sortedTickets.map(t => (
              <TicketCard key={t.id} ticket={t} lastBall={lastBall} isWinner={!!t.winningPattern} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

Object.assign(window, {
  GameRoomDesktop, GameRoomMobile, BallStage, TicketCard, PatternPanel, NavBar,
  useLiveGame, useTicketsState, aggregatePatterns, PLAYER_TICKETS, DRAW_SEQUENCE,
});
