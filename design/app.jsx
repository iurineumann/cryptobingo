// App — design canvas hosting all CryptoBingo screens.
// Sections:
//   • Layout Templates  — the shell pattern (player / admin)
//   • Game Room         — live drawing + winner summary, comfortable / compact / iOS
// Tweaks: theme, motion, stage treatment, halo, patterns panel.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "playing": true,
  "speedMs": 1800,
  "stageStyle": "spotlight",
  "showHalo": true,
  "showPatterns": true
}/*EDITMODE-END*/;

function App() {
  const [state, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', state.theme || 'dark');
  }, [state.theme]);

  const onToggleTheme = React.useCallback(() => {
    setTweak('theme', state.theme === 'dark' ? 'light' : 'dark');
  }, [state.theme, setTweak]);

  const shared = {
    theme: state.theme,
    onToggleTheme,
    stageStyle: state.stageStyle,
    showHalo: state.showHalo,
    showPatterns: state.showPatterns,
    playing: state.playing,
    speedMs: state.speedMs,
  };

  const player = {
    theme: state.theme,
    onToggleTheme,
    user: { name: 'jogador1.wax', balance: 234.5832 },
  };

  const admin = {
    theme: state.theme,
    onToggleTheme,
    user: { name: 'contractadmin', balance: 0 },
  };

  return (
    <React.Fragment>
      <window.DesignCanvas>

        {/* ── LAYOUT TEMPLATES ───────────────────────────────────── */}
        <window.DCSection id="layout" title="Layout Templates">
          <window.DCArtboard
            id="layout-player-lobby"
            label="L1 Player Shell — Lobby"
            width={1280}
            height={900}
          >
            <window.SiteLayout
              {...player}
              mode="player"
              section="lobby"
              artboardId="L1 Player Lobby"
              pageHeader={
                <window.PageHeader
                  eyebrow="Salões"
                  title="Salas Abertas"
                  badges={
                    <React.Fragment>
                      <span className="cb-badge-success">
                        <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
                        {window.LOBBY_GAMES.filter(g => g.status === 'funding').length} aceitando cartelas
                      </span>
                      <span className="cb-badge-neutral">
                        atualiza a cada 5s
                      </span>
                    </React.Fragment>
                  }
                  actions={
                    <React.Fragment>
                      <button className="cb-btn cb-btn-ghost cb-btn-sm">Filtros avançados</button>
                      <button className="cb-btn cb-btn-primary cb-btn-sm">Aviso de novas salas</button>
                    </React.Fragment>
                  }
                />
              }
            >
              <window.LobbyPage />
            </window.SiteLayout>
          </window.DCArtboard>

          <window.DCArtboard
            id="layout-admin-dashboard"
            label="L2 Admin Shell — Dashboard"
            width={1280}
            height={900}
          >
            <window.SiteLayout
              {...admin}
              mode="admin"
              section="dashboard"
              artboardId="L2 Admin Dashboard"
              pageHeader={
                <window.PageHeader
                  eyebrow="Visão Geral"
                  title="Dashboard"
                  badges={
                    <React.Fragment>
                      <span className="cb-badge-neutral">Período: últimos 30 dias</span>
                      <span className="cb-badge-success">
                        <span className="cb-status-dot cb-status-dot-live" aria-hidden="true" />
                        Indexer sincronizado
                      </span>
                    </React.Fragment>
                  }
                  actions={
                    <React.Fragment>
                      <button className="cb-btn cb-btn-outline cb-btn-sm">Exportar CSV</button>
                      <button className="cb-btn cb-btn-primary cb-btn-sm">Sync Ledger</button>
                    </React.Fragment>
                  }
                />
              }
            >
              <window.AdminDashboard />
            </window.SiteLayout>
          </window.DCArtboard>
        </window.DCSection>

        {/* ── GAME ROOM ──────────────────────────────────────────── */}
        <window.DCSection id="game-room" title="Game Room">
          <window.DCArtboard
            id="hero"
            label="G1 Live Drawing — Comfortable"
            width={1280}
            height={1000}
          >
            <window.GameRoomDesktop
              {...shared}
              artboardId="G1 Live Drawing"
              density="comfortable"
              startAt={4}
              maxBalls={9}
            />
          </window.DCArtboard>

          <window.DCArtboard
            id="bingo"
            label="G2 Resumo da Rodada — Vencedores"
            width={1280}
            height={1000}
          >
            <window.GameRoomDesktop
              {...shared}
              artboardId="G2 Resumo da Rodada"
              density="comfortable"
              startAt={30}
              maxBalls={30}
              playing={false}
              endedMode={true}
            />
          </window.DCArtboard>

          <window.DCArtboard
            id="compact"
            label="G3 Compact — denser, more tickets per row"
            width={1280}
            height={960}
          >
            <window.GameRoomDesktop
              {...shared}
              artboardId="G3 Compact"
              density="compact"
              startAt={6}
              maxBalls={8}
            />
          </window.DCArtboard>
        </window.DCSection>

        {/* ── MOBILE ─────────────────────────────────────────────── */}
        <window.DCSection id="mobile" title="Mobile — iOS">
          <window.DCArtboard
            id="ios"
            label="M1 iOS — Live Drawing"
            width={400}
            height={860}
          >
            <window.IOSDevice
              statusBar={{ time: '21:47', battery: 86, signal: 3, wifi: true }}
              showHomeIndicator={true}
            >
              <window.GameRoomMobile
                {...shared}
                artboardId="M1 iOS Live"
                startAt={5}
                maxBalls={9}
              />
            </window.IOSDevice>
          </window.DCArtboard>
        </window.DCSection>

      </window.DesignCanvas>

      <window.TweaksPanel title="CryptoBingo">
        <window.TweakSection label="Theme">
          <window.TweakRadio
            label="Mode"
            value={state.theme}
            onChange={(v) => setTweak('theme', v)}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
            ]}
          />
        </window.TweakSection>

        <window.TweakSection label="Draw motion">
          <window.TweakToggle
            label="Auto-play"
            value={state.playing}
            onChange={(v) => setTweak('playing', v)}
          />
          <window.TweakSlider
            label="Drop interval"
            min={600}
            max={4000}
            step={100}
            value={state.speedMs}
            unit="ms"
            onChange={(v) => setTweak('speedMs', v)}
          />
        </window.TweakSection>

        <window.TweakSection label="Stage">
          <window.TweakRadio
            label="Treatment"
            value={state.stageStyle}
            onChange={(v) => setTweak('stageStyle', v)}
            options={[
              { value: 'minimal', label: 'Min' },
              { value: 'spotlight', label: 'Spot' },
              { value: 'arena', label: 'Arena' },
            ]}
          />
          <window.TweakToggle
            label="Show halo"
            value={state.showHalo}
            onChange={(v) => setTweak('showHalo', v)}
          />
          <window.TweakToggle
            label="Patterns panel"
            value={state.showPatterns}
            onChange={(v) => setTweak('showPatterns', v)}
          />
        </window.TweakSection>
      </window.TweaksPanel>
    </React.Fragment>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
