// Placeholder pages — used to demonstrate the SiteLayout shell.
// Real implementations live in apps/frontend/src/components/.

const { useMemo: useMemoP } = React;

// ── Lobby — list of open games ───────────────────────────────────────────────

const LOBBY_GAMES = [
  { id: 'G-2147', name: 'Bingo Padrão Rápido', status: 'drawing', price: 10, prize: 1240, players: 124, tickets: 248, balls: 9, watching: true },
  { id: 'G-2148', name: 'Quadrado Diagonal',   status: 'funding', price: 25, prize: 1875,  players: 47,  tickets: 75,  balls: 0 },
  { id: 'G-2149', name: 'Cartela Cheia · 850W', status: 'funding', price: 50, prize: 4250, players: 18,  tickets: 85,  balls: 0 },
  { id: 'G-2150', name: 'Linha Única',          status: 'funding', price: 5,  prize: 320,  players: 64,  tickets: 64,  balls: 0 },
  { id: 'G-2151', name: 'Bingo Aceleradão',     status: 'locked',  price: 15, prize: 945,  players: 63,  tickets: 63,  balls: 0 },
  { id: 'G-2152', name: 'Diagonais & Cantos',   status: 'funding', price: 20, prize: 1100, players: 35,  tickets: 55,  balls: 0 },
  { id: 'G-2153', name: 'Coluna N · 60W',       status: 'funding', price: 8,  prize: 432,  players: 41,  tickets: 54,  balls: 0 },
  { id: 'G-2154', name: '4 Cantos · 80W',       status: 'created', price: 12, prize: 0,    players: 0,   tickets: 0,   balls: 0, scheduled: '21:50' },
];

const STATUS_LABEL = {
  funding:  'Aberto',
  locked:   'Travado',
  drawing:  'Sorteando',
  drawn:    'Resolvido',
  created:  'Agendado',
  archived: 'Arquivado',
  aborted:  'Abortado',
};

function LobbyPage() {
  const [filter, setFilter] = React.useState('all');
  const filtered = LOBBY_GAMES.filter(g => filter === 'all' ? true : g.status === filter);

  return (
    <div className="page-lobby">
      <div className="lobby-filters" role="tablist" aria-label="Filtrar salas">
        {[
          { id: 'all', label: 'Todas', count: LOBBY_GAMES.length },
          { id: 'funding', label: 'Aberto', count: LOBBY_GAMES.filter(g => g.status === 'funding').length },
          { id: 'drawing', label: 'Sorteando', count: LOBBY_GAMES.filter(g => g.status === 'drawing').length },
          { id: 'locked', label: 'Travadas', count: LOBBY_GAMES.filter(g => g.status === 'locked').length },
          { id: 'created', label: 'Agendadas', count: LOBBY_GAMES.filter(g => g.status === 'created').length },
        ].map(f => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            className={`lobby-filter${filter === f.id ? ' is-active' : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
            <span className="count">{f.count}</span>
          </button>
        ))}
      </div>

      <div className="lobby-grid">
        {filtered.map(g => <LobbyCard key={g.id} game={g} />)}
      </div>
    </div>
  );
}

function LobbyCard({ game }) {
  const fillPct = game.status === 'funding' || game.status === 'locked'
    ? Math.min(100, (game.tickets / 80) * 100)
    : game.status === 'drawing' ? 100 : 0;
  const isWatching = game.watching;
  const isLive = game.status === 'drawing';

  return (
    <article
      className={`lobby-card${isWatching ? ' is-watching' : ''}`}
      aria-label={`Sala ${game.id}, ${STATUS_LABEL[game.status]}`}
    >
      <header className="lobby-card-head">
        <div>
          <span className="lobby-card-id">#{game.id}</span>
          <h3 className="lobby-card-name">{game.name}</h3>
        </div>
        <span className={`cb-status-${game.status}`}>
          {STATUS_LABEL[game.status]}
        </span>
      </header>

      <dl className="lobby-card-stats">
        <div>
          <dt>Prêmio</dt>
          <dd className="prize">{game.prize.toLocaleString('pt-BR')}<span className="unit">W</span></dd>
        </div>
        <div>
          <dt>Cartela</dt>
          <dd className="price">{game.price}<span className="unit">W</span></dd>
        </div>
        <div>
          <dt>Jogadores</dt>
          <dd>{game.players}</dd>
        </div>
      </dl>

      {game.status !== 'created' && (
        <div className="lobby-card-progress">
          <div className="cb-progress-track">
            <div className="cb-progress-fill" style={{ width: `${fillPct}%` }} />
          </div>
          <span className="meta">
            {isLive
              ? `${game.balls}/75 bolas`
              : `${game.tickets} cartelas vendidas`}
          </span>
        </div>
      )}

      {game.status === 'created' && (
        <div className="lobby-card-scheduled">
          <span className="icon" aria-hidden="true">⏱</span>
          Inicia às <b>{game.scheduled}</b>
        </div>
      )}

      <div className="lobby-card-actions">
        {game.status === 'funding' && (
          <button className="cb-btn cb-btn-primary" style={{ width: '100%' }}>
            Comprar Cartelas
          </button>
        )}
        {game.status === 'drawing' && (
          <button className={`cb-btn ${isWatching ? 'cb-btn-accent' : 'cb-btn-outline'}`} style={{ width: '100%' }}>
            {isWatching ? 'Voltar para a sala' : 'Assistir ao vivo'}
          </button>
        )}
        {game.status === 'locked' && (
          <button className="cb-btn cb-btn-outline" style={{ width: '100%' }} disabled>
            Aguardando sorteio
          </button>
        )}
        {game.status === 'created' && (
          <button className="cb-btn cb-btn-ghost" style={{ width: '100%' }}>
            Lembrar quando abrir
          </button>
        )}
      </div>
    </article>
  );
}

// ── AdminDashboard ───────────────────────────────────────────────────────────

const ADMIN_KPIS = [
  { id: 'rtp',       label: 'RTP (30d)',         value: '84.7',  unit: '%',   delta: '+0.3pp', positive: true,  hint: 'Alvo: ≥ 85.0%' },
  { id: 'ggr',       label: 'GGR (30d)',         value: '12.4',  unit: 'k W', delta: '+8.2%',  positive: true,  hint: 'House edge bruta' },
  { id: 'wagered',   label: 'Volume Apostado',   value: '82.6',  unit: 'k W', delta: '+11%',   positive: true,  hint: 'Tickets × preço' },
  { id: 'paidout',   label: 'Pago em Prêmios',   value: '70.0',  unit: 'k W', delta: '+10%',   positive: true,  hint: 'Conferido on-chain' },
  { id: 'players',   label: 'Jogadores Ativos',  value: '1.247',  unit: '',    delta: '+62',    positive: true,  hint: 'Últimas 24h' },
  { id: 'pendclaim', label: 'Prêmios Pendentes', value: '4',     unit: '',    delta: '-2',     positive: true,  hint: 'Quarentena 24h' },
];

const ADMIN_RECENT = [
  { id: 'G-2146', status: 'drawn',    wagered: '1.870 W', paid: '1.589 W', rtp: '84.9%', winners: 6 },
  { id: 'G-2145', status: 'drawn',    wagered: '1.230 W', paid: '1.045 W', rtp: '85.0%', winners: 4 },
  { id: 'G-2144', status: 'archived', wagered: '2.560 W', paid: '2.176 W', rtp: '85.0%', winners: 9 },
  { id: 'G-2143', status: 'drawn',    wagered: '950 W',   paid: '807 W',   rtp: '84.9%', winners: 3 },
  { id: 'G-2142', status: 'aborted',  wagered: '410 W',   paid: '410 W',   rtp: '100%',  winners: 0 },
  { id: 'G-2141', status: 'archived', wagered: '1.640 W', paid: '1.394 W', rtp: '85.0%', winners: 5 },
];

function AdminDashboard() {
  return (
    <div className="page-admin">
      <section className="admin-kpis" aria-label="Indicadores principais">
        {ADMIN_KPIS.map(k => (
          <article key={k.id} className="admin-kpi">
            <header>
              <span className="label">{k.label}</span>
              <span className={`delta${k.positive ? ' is-positive' : ' is-negative'}`}>
                {k.delta}
              </span>
            </header>
            <div className="value">
              {k.value}<span className="unit">{k.unit}</span>
            </div>
            <span className="hint">{k.hint}</span>
          </article>
        ))}
      </section>

      <section className="admin-split">
        <article className="admin-card">
          <header className="admin-card-head">
            <div>
              <h2 className="admin-card-title">RTP — Últimos 30 dias</h2>
              <p className="admin-card-sub">Retorno ao jogador, calculado on-chain</p>
            </div>
            <span className="cb-badge-brand">85% alvo</span>
          </header>
          <div className="admin-chart" aria-hidden="true">
            {/* Placeholder chart: bars by day */}
            <div className="admin-chart-target" style={{ bottom: '60%' }}>
              <span>alvo 85%</span>
            </div>
            {Array.from({ length: 30 }, (_, i) => {
              const h = 50 + Math.sin(i * 0.6) * 12 + (Math.random() - 0.5) * 6;
              return (
                <div key={i} className="admin-chart-bar" style={{ height: `${h}%` }} />
              );
            })}
          </div>
          <footer className="admin-chart-foot">
            <span><i className="dot brand" /> RTP diário</span>
            <span><i className="dot accent" /> Meta regulatória</span>
          </footer>
        </article>

        <article className="admin-card">
          <header className="admin-card-head">
            <div>
              <h2 className="admin-card-title">Histórico de Jogos</h2>
              <p className="admin-card-sub">Últimos 6 sorteios encerrados</p>
            </div>
            <button className="cb-btn cb-btn-outline cb-btn-sm">Ver todos</button>
          </header>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Game ID</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Apostado</th>
                  <th style={{ textAlign: 'right' }}>Pago</th>
                  <th style={{ textAlign: 'right' }}>RTP</th>
                  <th style={{ textAlign: 'right' }}>Vencedores</th>
                </tr>
              </thead>
              <tbody>
                {ADMIN_RECENT.map(g => (
                  <tr key={g.id}>
                    <td><span className="mono">#{g.id}</span></td>
                    <td><span className={`cb-status-${g.status}`}>{STATUS_LABEL[g.status]}</span></td>
                    <td style={{ textAlign: 'right' }} className="mono">{g.wagered}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{g.paid}</td>
                    <td style={{ textAlign: 'right' }} className="mono">{g.rtp}</td>
                    <td style={{ textAlign: 'right' }}>{g.winners}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      </section>
    </div>
  );
}

Object.assign(window, { LobbyPage, AdminDashboard, LOBBY_GAMES, STATUS_LABEL });
