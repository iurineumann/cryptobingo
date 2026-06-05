// Landing page — public face for non-logged users.
// Sections: Marketing nav, Hero with live ball demo, Stats, Salas Live,
// Why CryptoBingo, Sponsors band, Footer.

const { useState: useStateL, useEffect: useEffectL, useRef: useRefL } = React;

// ── MarketingNav ─────────────────────────────────────────────────────────────

function MarketingNav({ theme, onToggleTheme, onConnect }) {
  return (
    <header className="landing-nav">
      <div className="landing-nav-inner">
        <a href="#/" className="cb-logo">Crypto<span>Bingo</span></a>

        <nav className="landing-nav-links" aria-label="Navegação">
          <a href="#how">Como funciona</a>
          <a href="#live">Salas ao vivo</a>
          <a href="#stats">Auditoria</a>
          <a href="#sponsors">Para patrocinadores</a>
        </nav>

        <div className="landing-nav-right">
          <span className="landing-lang" aria-label="Idioma">
            <button className="active" type="button">PT</button>
            <button type="button">EN</button>
            <button type="button">中</button>
          </span>
          <button
            className="cb-theme-toggle"
            onClick={onToggleTheme}
            aria-label="Alternar tema"
            title={theme === 'dark' ? 'Tema claro' : 'Tema escuro'}
          >
            {theme === 'dark' ? '☾' : '☀'}
          </button>
          <button className="cb-btn cb-btn-primary cb-btn-sm" type="button" onClick={onConnect}>
            <span aria-hidden="true">◆</span>
            Conectar Carteira
          </button>
        </div>
      </div>
    </header>
  );
}

// ── HeroVisual — animated ball + bingo card composition ──────────────────────

function HeroVisual() {
  // Cycle through a mini sequence to demo the live drawing
  const SEQ = [42, 17, 64, 8, 33, 71, 51, 22];
  const COLORS = window.PLAYER_TICKETS ? null : null; // not needed
  const [i, setI] = useStateL(0);
  const ballRef = useRefL(null);

  useEffectL(() => {
    const id = setInterval(() => setI(x => (x + 1) % SEQ.length), 2200);
    return () => clearInterval(id);
  }, []);

  // Animate ball drop on number change
  useEffectL(() => {
    if (!ballRef.current) return;
    const el = ballRef.current;
    el.classList.remove('gr-drop');
    void el.offsetWidth;
    el.classList.add('gr-drop');
  }, [i]);

  const n = SEQ[i];
  const col = n <= 15 ? 'B' : n <= 30 ? 'I' : n <= 45 ? 'N' : n <= 60 ? 'G' : 'O';
  const colorVar = {
    B: 'var(--color-bingo-b)', I: 'var(--color-bingo-i)',
    N: 'var(--color-bingo-n)', G: 'var(--color-bingo-g)',
    O: 'var(--color-bingo-o)',
  }[col];

  // Build a stylized bingo card preview behind the ball
  // marked cells form a near-complete diagonal
  const MARK = new Set([0, 6, 12, 18, 24, 2, 8, 17, 22, 11]);
  const CELLS = [
    ['B', 4], ['I', 22], ['N', 33], ['G', 47], ['O', 64],
    ['B', 11], ['I', 19], ['N', 39], ['G', 51], ['O', 71],
    ['B', 8], ['I', 25], ['N', '★'], ['G', 58], ['O', 67],
    ['B', 14], ['I', 17], ['N', 36], ['G', 49], ['O', 73],
    ['B', 5], ['I', 28], ['N', 44], ['G', 54], ['O', 68],
  ];

  return (
    <div className="landing-hero-visual" aria-hidden="true">
      <div className="hero-card-frame">
        <div className="hero-card-head">
          {['B','I','N','G','O'].map((c, idx) => (
            <span key={c} className="hero-card-letter" style={{ color: ['var(--color-bingo-b)','var(--color-bingo-i)','var(--color-bingo-n)','var(--color-bingo-g)','var(--color-bingo-o)'][idx] }}>{c}</span>
          ))}
        </div>
        <div className="hero-card-grid">
          {CELLS.map(([c, val], idx) => {
            const isFree = val === '★';
            const isMarked = MARK.has(idx) || isFree;
            const colKey = c;
            return (
              <span
                key={idx}
                className={`hero-card-cell${isMarked ? ' is-marked' : ''}${isFree ? ' is-free' : ''}`}
                style={isMarked && !isFree ? { '--cell-color': {
                  B:'var(--color-bingo-b)',I:'var(--color-bingo-i)',N:'var(--color-bingo-n)',
                  G:'var(--color-bingo-g)',O:'var(--color-bingo-o)'
                }[colKey] } : {}}
              >
                {val}
              </span>
            );
          })}
        </div>
      </div>

      <div className="hero-ball-stage" style={{ '--ball-color': colorVar }}>
        <div className="hero-halo" />
        <div ref={ballRef} className="gr-ball-hero gr-drop hero-ball">
          <div className="ball-surface" />
          <span className="ball-letter">{col}</span>
          <span className="ball-number">{n}</span>
        </div>
      </div>

      {/* Floating mini accent balls */}
      <span className="hero-float hero-float-1" style={{ background: 'var(--color-bingo-b)' }}>3</span>
      <span className="hero-float hero-float-2" style={{ background: 'var(--color-bingo-g)' }}>49</span>
      <span className="hero-float hero-float-3" style={{ background: 'var(--color-accent-400)', color: '#1a1a2e' }}>★</span>
    </div>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onConnect }) {
  return (
    <section className="landing-hero" id="hero">
      <div className="landing-hero-inner">
        <div className="landing-hero-content">
          <span className="landing-hero-eyebrow">
            <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
            247 jogadores online · 3 sorteios agora
          </span>

          <h1 className="landing-hero-title">
            Bingo on-chain.
            <span className="landing-hero-title-accent"> Prêmio na carteira em segundos.</span>
          </h1>

          <p className="landing-hero-sub">
            Sorteios verificáveis em blockchain. Pagamento automático via smart contract.
            Sem cadastro. Sem espera. Sem intermediário.
          </p>

          <div className="landing-hero-ctas">
            <button className="cb-btn cb-btn-primary cb-btn-xl cb-btn-pill" type="button" onClick={onConnect}>
              <span aria-hidden="true">◆</span>
              Conectar Carteira Web3
            </button>
            <a href="#how" className="cb-btn cb-btn-ghost cb-btn-lg">
              Como funciona →
            </a>
          </div>

          <div className="landing-hero-trust">
            <span className="trust-item">
              <span aria-hidden="true">⚡</span>
              Pagamento &lt; 3s
            </span>
            <span className="trust-divider" />
            <span className="trust-item">
              <span aria-hidden="true">🛡</span>
              Provably Fair
            </span>
            <span className="trust-divider" />
            <span className="trust-item">
              <span aria-hidden="true">◆</span>
              WAX Mainnet
            </span>
            <span className="trust-divider" />
            <span className="trust-item">
              <span aria-hidden="true">⚖</span>
              Lei 14.790/23
            </span>
          </div>
        </div>

        <HeroVisual />
      </div>
    </section>
  );
}

// ── Stats Strip ──────────────────────────────────────────────────────────────

const LANDING_STATS = [
  { value: '2,4M',  unit: 'WAX', label: 'pagos em prêmios',     hint: 'verificável on-chain', accent: true },
  { value: '84,7',  unit: '%',   label: 'RTP médio (30d)',       hint: 'meta regulatória 85%' },
  { value: '< 3',   unit: 's',   label: 'pagamento médio',       hint: 'do BINGO! ao recebimento' },
  { value: '12,4k', unit: '',    label: 'vencedores este mês',   hint: 'em 1.842 sorteios' },
];

function StatsStrip() {
  return (
    <section className="landing-stats" id="stats" aria-label="Estatísticas da plataforma">
      <div className="landing-stats-inner">
        {LANDING_STATS.map((s, i) => (
          <article key={i} className={`landing-stat${s.accent ? ' is-accent' : ''}`}>
            <span className="value">
              {s.value}<span className="unit">{s.unit}</span>
            </span>
            <span className="label">{s.label}</span>
            <span className="hint">{s.hint}</span>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Live Now — preview of current games ──────────────────────────────────────

function LiveNow() {
  // Use the first 3 lobby games, with watching preview
  const previewGames = (window.LOBBY_GAMES || []).slice(0, 3);

  return (
    <section className="landing-live" id="live">
      <header className="landing-section-head">
        <div>
          <span className="eyebrow">
            <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
            Acontecendo agora
          </span>
          <h2 className="landing-section-title">Entre numa sala em 5 segundos</h2>
          <p className="landing-section-sub">
            Conecte sua carteira e jogue na próxima rodada. Sem cadastro. Sem KYC.
          </p>
        </div>
        <a href="#/lobby" className="cb-btn cb-btn-outline">Ver todas as salas →</a>
      </header>

      <div className="landing-live-grid">
        {previewGames.map(g => <window.LobbyCard key={g.id} game={g} />)}
      </div>

      <div className="landing-live-overlay">
        <button className="cb-btn cb-btn-accent cb-btn-lg cb-btn-pill" type="button">
          <span aria-hidden="true">▶</span>
          Conectar para jogar
        </button>
      </div>
    </section>
  );
}

// ── Why CryptoBingo ──────────────────────────────────────────────────────────

const FEATURES = [
  {
    eyebrow: 'Provably Fair',
    title: 'Cada bola é provada criptograficamente.',
    desc: 'Sorteios usam o oráculo on-chain WAX. O hash da semente é publicado antes do sorteio começar — você pode auditar do seu computador, ou usar nossa página de verificação.',
    bullets: ['Hash pré-sorteio público', 'Auditoria por qualquer um', 'Verificação em 1 clique'],
    color: 'var(--color-bingo-n)',
  },
  {
    eyebrow: 'Instant Payout',
    title: 'Smart contract paga direto na sua carteira.',
    desc: 'Sem botão de "sacar". Sem aprovação de admin. No instante em que o sorteio confirma um BINGO, o contrato transfere os tokens. Tempo médio: menos de 3 segundos.',
    bullets: ['Sem withdrawal flow', 'Sem KYC para retirar', 'Confirmação on-chain'],
    color: 'var(--color-accent-400)',
  },
  {
    eyebrow: 'Sem Cadastro',
    title: 'Conecte sua wallet WAX e jogue.',
    desc: 'Nenhum e-mail, senha, CPF ou cartão. Sua identidade é sua chave pública WAX. Nós nunca pedimos dados pessoais — o smart contract não precisa deles.',
    bullets: ['Suporte a Anchor, Cloud Wallet', 'Login com WharfKit', 'Compatível com Antelope'],
    color: 'var(--cb-brand)',
  },
];

function WhySection() {
  return (
    <section className="landing-why" id="how">
      <header className="landing-section-head centered">
        <span className="eyebrow">Por que CryptoBingo</span>
        <h2 className="landing-section-title">Diferente de loteria de site qualquer.</h2>
        <p className="landing-section-sub">
          A blockchain não é detalhe técnico — é o motivo da plataforma existir.
        </p>
      </header>

      <div className="landing-why-grid">
        {FEATURES.map((f, i) => (
          <article key={i} className="landing-feature" style={{ '--feature-color': f.color }}>
            <span className="number">0{i + 1}</span>
            <span className="eyebrow">{f.eyebrow}</span>
            <h3 className="title">{f.title}</h3>
            <p className="desc">{f.desc}</p>
            <ul className="bullets">
              {f.bullets.map((b, j) => (
                <li key={j}>
                  <span className="check" aria-hidden="true">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  );
}

// ── Sponsors Band ────────────────────────────────────────────────────────────

function SponsorsBand() {
  return (
    <section className="landing-sponsors" id="sponsors">
      <div className="landing-sponsors-inner">
        <div className="landing-sponsors-content">
          <span className="eyebrow">
            <span className="dot" aria-hidden="true" />
            Para empresas e influencers
          </span>
          <h2 className="title">
            Distribua prêmios para sua audiência —
            <span className="accent"> sem chargeback, sem reconciliação.</span>
          </h2>
          <p className="desc">
            Patrocine salas gamificadas, premie sua comunidade, recompense engajamento.
            O depósito é trustless on-chain. A distribuição é automática. Você só decide
            quanto, quando e quem ganha.
          </p>

          <div className="landing-sponsors-stats">
            <div>
              <span className="value">14</span>
              <span className="label">campanhas ativas</span>
            </div>
            <div>
              <span className="value">487k<span className="unit">W</span></span>
              <span className="label">depositados em escrow</span>
            </div>
            <div>
              <span className="value">9,4k</span>
              <span className="label">prêmios distribuídos</span>
            </div>
          </div>

          <div className="landing-sponsors-ctas">
            <button className="cb-btn cb-btn-accent cb-btn-lg cb-btn-pill" type="button">
              Solicitar acesso B2B
            </button>
            <a href="#" className="cb-btn cb-btn-ghost cb-btn-lg">
              Ler whitepaper para sponsors →
            </a>
          </div>
        </div>

        <div className="landing-sponsors-visual" aria-hidden="true">
          <div className="sponsors-card sponsors-card-1">
            <span className="sponsors-card-label">Campanha · Aniversário do Canal</span>
            <span className="sponsors-card-amount">25.000 WAX</span>
            <div className="sponsors-card-bar"><i style={{ width: '64%' }} /></div>
            <span className="sponsors-card-meta">64% distribuído · 12 dias restantes</span>
          </div>
          <div className="sponsors-card sponsors-card-2">
            <span className="sponsors-card-label">Campanha · Black Friday</span>
            <span className="sponsors-card-amount">10.000 WAX</span>
            <div className="sponsors-card-bar"><i style={{ width: '92%' }} /></div>
            <span className="sponsors-card-meta">92% distribuído · 2 dias restantes</span>
          </div>
          <div className="sponsors-card sponsors-card-3">
            <span className="sponsors-card-label">Campanha · Influencer X</span>
            <span className="sponsors-card-amount">5.000 WAX</span>
            <div className="sponsors-card-bar"><i style={{ width: '38%' }} /></div>
            <span className="sponsors-card-meta">38% distribuído · 18 dias restantes</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ── Footer ───────────────────────────────────────────────────────────────────

function LandingFooter() {
  return (
    <footer className="landing-footer">
      <div className="landing-footer-inner">
        <div className="landing-footer-brand">
          <a href="#/" className="cb-logo" style={{ fontSize: '1.4rem' }}>
            Crypto<span>Bingo</span>
          </a>
          <p>Bingo descentralizado. Pagamento instantâneo.</p>
          <span className="landing-footer-chain">
            <span aria-hidden="true">◆</span>
            Construído na WAX Mainnet
          </span>
        </div>

        <div className="landing-footer-cols">
          <div>
            <h4>Plataforma</h4>
            <a href="#/lobby">Salas de jogo</a>
            <a href="#/winners">Vencedores</a>
            <a href="#stats">Estatísticas</a>
            <a href="#how">Como funciona</a>
          </div>
          <div>
            <h4>Empresas</h4>
            <a href="#sponsors">Para patrocinadores</a>
            <a href="#">Whitepaper B2B</a>
            <a href="#">Casos de uso</a>
            <a href="#">Solicitar acesso</a>
          </div>
          <div>
            <h4>Auditoria</h4>
            <a href="#">Verificar sorteio</a>
            <a href="#">Smart contract</a>
            <a href="#">Compliance · Lei 14.790</a>
            <a href="#">RTP histórico</a>
          </div>
          <div>
            <h4>Comunidade</h4>
            <a href="#">Discord</a>
            <a href="#">Telegram</a>
            <a href="#">GitHub</a>
            <a href="#">X / Twitter</a>
          </div>
        </div>
      </div>

      <div className="landing-footer-bottom">
        <span>© 2026 CryptoBingo · Provably Fair Gaming Protocol</span>
        <span className="links">
          <a href="#">Termos</a>
          <a href="#">Privacidade</a>
          <a href="#">Cookies</a>
        </span>
      </div>
    </footer>
  );
}

// ── LandingPage ──────────────────────────────────────────────────────────────

function LandingPage({ theme, onToggleTheme, artboardId }) {
  const onConnect = React.useCallback(() => {
    // Placeholder — in real app, opens wallet modal
  }, []);

  return (
    <div className="landing-shell" data-screen-label={artboardId}>
      <MarketingNav theme={theme} onToggleTheme={onToggleTheme} onConnect={onConnect} />
      <Hero onConnect={onConnect} />
      <StatsStrip />
      <LiveNow />
      <WhySection />
      <SponsorsBand />
      <LandingFooter />
    </div>
  );
}

Object.assign(window, {
  LandingPage, MarketingNav, Hero, HeroVisual, StatsStrip,
  LiveNow, WhySection, SponsorsBand, LandingFooter,
});
