# ADR-015: Roteamento Client-Side Baseado em URL

**Data:** 2026-06-03
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O frontend do CryptoBingo utilizava um sistema de roteamento **state-based puro**: um
discriminated union `Route` em `App.tsx` controlava qual componente renderizar, sem qualquer
sincronia com a URL do browser.

Esse modelo traz limitações críticas para uma plataforma de GameFi com usuários recorrentes:

| Limitação | Impacto |
|---|---|
| Sem deep links | Impossível compartilhar link direto de sala, replay ou seção admin |
| Botão Voltar/Avançar inoperante | UX degradada; usuário perde contexto ao navegar |
| Sem SEO por rota | Open Graph, meta tags e indexação prejudicados |
| Acessibilidade comprometida | Screen readers não anunciam mudança de "página" |
| Push Notifications inutilizáveis | Notificações não conseguem linkar para salas específicas |
| Tabs do browser sem identidade | Título e URL iguais em qualquer tela |

---

## Decisão

Adotar **React Router DOM v6** com `BrowserRouter` + `Routes` para sincronizar o estado
de navegação com a URL, mantendo a arquitetura SPA (Single Page Application) existente.

### Avaliação de Alternativas

| Opção | Pro | Con | Decisão |
|---|---|---|---|
| **React Router v6** | Maduro, SPA-first, TS nativo, bundle mínimo (~12 KB gz), sem SSR overhead | +1 dependência | ✅ **Escolhido** |
| TanStack Router | Full type-safety em params, file-based routing | Curva steep, mudança de paradigma, mais setup | ❌ |
| History API nativo | Zero dep, controle total | Scroll restoration, popstate, back/forward — não trivial de manter | ❌ |
| React Router v7 | API mais moderna | Empurra SSR/Remix model desnecessariamente para projeto SPA puro | ❌ |

**React Router v6** é a escolha pragmática: mantém o projeto SPA-first, tem suporte TypeScript
de primeira classe, o bundle de ~12 KB gzip é negligível para uma aplicação Web3, e a API
`BrowserRouter` + `useNavigate` substitui `setRoute(...)` com mudança mínima de código.

---

## Tabela de Rotas

| URL | Componente | Auth | Admin | Nota |
|---|---|---|---|---|
| `/` | `<RootRedirect>` | — | — | Sessão ativa → `/lobby`; sem sessão → `<LandingPage>` |
| `/lobby` | `PlayerShell > Lobby` | ✅ | — | Tab padrão do shell |
| `/history` | `PlayerShell > MyHistoryPage` | ✅ | — | Histórico pessoal |
| `/wallet` | `PlayerShell > WalletPage` | ✅ | — | Carteira |
| `/room/:roomId/:gameId` | `GameRoom` (full-screen) | ✅ | — | `key={gameId}` garante remount ao trocar jogo |
| `/replay/:gameId` | `ReplayRoom` (full-screen) | ✅ | — | Replay de partida encerrada |
| `/room/:roomId/history` | `RoomHistoryPanel` (full-screen) | ✅ | — | Histórico da sala |
| `/admin` | redirect | ✅ | ✅ | Redireciona para `/admin/dashboard` |
| `/admin/:section` | `AdminLayout` (full-screen) | ✅ | ✅ | Seção via URL param |
| `*` | redirect | — | — | Qualquer rota inválida → `/` |

---

## Arquitetura

### Hierarquia de componentes em App.tsx

```
App()                    ← <BrowserRouter> wrapper (thin — necessário para hooks)
  └── AppRoot()          ← useNavigate + todo estado de sessão/tema
        ├── restoringSession=true  → <LoadingScreen> global (evita flash em deep links)
        └── <Routes>
              ├── /                 → <RootRedirect>
              ├── <AuthGuard>       ← layout route; redireciona para / se não autenticado
              │     ├── /lobby      → <PlayerShell> tab=lobby
              │     ├── /history    → <PlayerShell> tab=history
              │     ├── /wallet     → <PlayerShell> tab=wallet
              │     ├── /room/:r/:g → <GameRoom key={gameId}>
              │     ├── /replay/:g  → <ReplayRoom>
              │     ├── /room/:r/h  → <RoomHistoryPanel>
              │     └── <AdminGuard> ← layout route; redireciona para /lobby se não admin
              │           ├── /admin      → <Navigate to="/admin/dashboard">
              │           └── /admin/:s  → <AdminLayout section={s}>
              └── *                 → <Navigate to="/" replace>
```

### Guards

**`AuthGuard`** (layout route via `<Outlet>`):
- `restoringSession = true` → renderiza `<LoadingScreen>` (aguarda restore assíncrono)
- `!session || !profile` → `<Navigate to="/" replace />`
- caso contrário → `<Outlet />`

**`AdminGuard`** (aninhado dentro de AuthGuard):
- `!isAdmin` → `<Navigate to="/lobby" replace />`
- caso contrário → `<Outlet />`

### Session Restoration com Deep Links

Um novo estado `restoringSession` (boolean, inicial `true`) é setado para `false`
após o `sessionKit.restore()` completar (com ou sem sucesso). Enquanto `true`, a
`<LoadingScreen>` global é exibida **antes** das `<Routes>`, evitando que um deep link
como `/room/123/456` redirecione o usuário autenticado para `/` por um frame de tela.

```typescript
// Fluxo de restore
useEffect(() => {
  sessionKit.restore().then(async (restored) => {
    if (restored && getAuthToken()) {
      setSession(restored);
      await loadProfile();
      // Não navegar — o usuário permanece na URL que ele acessou
    }
  }).finally(() => setRestoringSession(false));
}, []);
```

### Prop-driven Navigation (sem acoplamento ao router nos filhos)

Todos os componentes filhos (`GameRoom`, `Lobby`, `AdminLayout`, etc.) mantêm suas
assinaturas de props atuais. Os callbacks (`onLeave`, `onGoToHistory`, `onEnterRoom`,
etc.) são closures que chamam `navigate(...)` internamente em `AppRoot`:

```typescript
// Em AppRoot — callbacks delegados para navigate()
const goToLobby    = () => navigate('/lobby');
const goToGame     = (roomId: string, gameId: string) =>
                       navigate(`/room/${roomId}/${gameId}`);
const goToAdmin    = (section = 'dashboard') =>
                       navigate(`/admin/${section}`);
```

Os componentes **não importam** react-router — o acoplamento fica confinado em `App.tsx`.

### `activeTab` via URL

A derivação do tab ativo migra de `route.page` para `useLocation().pathname`:

```typescript
const { pathname } = useLocation();
const activeTab = pathname.startsWith('/wallet')  ? 'wallet'
                : pathname.startsWith('/history') ? 'my_history'
                : 'lobby';
```

---

## Consequências

### Positivas
- Deep links funcionais em todas as rotas
- Botão Voltar/Avançar do browser funciona corretamente
- URL compartilhável para salas, replays e seções admin
- Base para SEO dinâmico (meta tags por rota) em sprint futura
- Acessibilidade: screen readers anunciam mudança de URL

### Negativas / Riscos Mitigados
- **+1 dependência** (`react-router-dom` ~12 KB gz) — aceitável
- **Servidor de produção** precisa de fallback SPA (nginx: `try_files $uri /index.html`)
- **`historyApiFallback: true`** necessário no Vite dev server

### Produção (nginx exemplo)
```nginx
location / {
    root /usr/share/nginx/html;
    try_files $uri $uri/ /index.html;
}
```

### Scroll Restoration
React Router v6 não restaura scroll automaticamente em SPAs com `BrowserRouter`.
Para ser tratado em sprint futura se houver reclamação de UX.

---

## Referências

- [React Router v6 Docs](https://reactrouter.com/en/main)
- ADR-009 — Admin Panel (seção admin afetada)
- ADR-010 — Rooms (rotas de sala afetadas)
- `SPEC.md §1` — Arquitetura Frontend
