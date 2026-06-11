# ADR-022 — bingogameswp: App Público (`apps/swap-ui`)

**Status:** Accepted
**Data:** 2026-06-10
**Decisores:** Iuri Neumann, Claude

---

## Contexto

O `bingogameswp` (ADR-018/019) é uma AMM x*y=k on-chain com pools públicos, taxa LP para
provedores e taxa de serviço configurável. A ADR-021 integrou o swap ao checkout do jogo,
mas a liquidez e o DEX em si ficaram invisíveis para o mercado externo.

Para atrair provedores de liquidez e posicionar o `bingogameswp` como um DEX independente
(similar ao Alcor/TACOCRYPTO na WAX), é necessário um app público separado do jogo.

---

## Decisão

### App separado em `apps/swap-ui`

Novo app Vite + React + TypeScript + Tailwind v4, com link bidirecional ao app de jogo.

**Por que separado e não embutido no frontend do jogo?**
- Audiências distintas: jogadores e investidores/provedores de liquidez.
- URLs diferentes (pode ser deployado em subdomínio próprio, ex.: swap.cryptobingo.io).
- Sem arrastar dependências do jogo (socket.io, campaign widgets, etc.) para um DEX puro.
- Permite design e rotas específicos de DEX sem poluir a navegação do jogo.

### Páginas

| Rota | Página | Descrição |
|---|---|---|
| `/swap` | SwapPage | Form swap: seleciona par, digita valor, obtém cotação, executa on-chain |
| `/pool` | PoolPage | Gerencia liquidez: add/remove, visualiza posições LP do usuário |
| `/analytics` | AnalyticsPage | TVL, volume por pool, price impact histórico (read-only) |
| `/` | Redireciona para `/swap` | Entrada padrão |

### Fluxo de swap (público — qualquer usuário WAX)

Igual ao ADR-021, porém com seleção livre de par (qualquer token aprovado no bingogameswp),
sem vinculação a compra de cartela:
```
seleciona token A → digita amount → busca quote → aprova slippage → assina tx Wharfkit
```

### Fluxo de liquidez (PoolPage)

```
add liq: envia token A + token B com memo "deposit,<pool_id>" → chama addliq()
remove liq: chama remliq(pool_id, lp_amount, min_a, min_b)
cancela depósito pendente: chama canceldep(pool_id)
```

### Design system compartilhado

Mesmos tokens Tailwind v4 (`--cb-brand`, `--cb-text-*`, `--cb-bg-*`, etc.) do frontend
do jogo, copiados para `apps/swap-ui/src/styles/`. A unificação num pacote `packages/design-system`
fica planejada para sprint futuro (evitar duplicata a longo prazo).

### i18n

Mesmos 3 locales (pt-BR, en-US, zh-CN) com chaves independentes. Não compartilha os
JSONs do frontend — o vocabulário de DEX é distinto do vocabulário de jogo.

### Links bidirecionais

- swap-ui Navbar: link "← Jogar" apontando para `VITE_GAME_URL` (env).
- frontend do jogo NavBar: link "Swap ↗" apontando para `VITE_SWAP_URL` (env).

---

## Alternativas consideradas

| Alternativa | Motivo de rejeição |
|---|---|
| Embutir DEX no frontend do jogo | Audências distintas, navegação conflitante, deploy acoplado |
| Usar monorepo shared UI package | Overhead de abstração prematuro — apps ainda divergem muito |
| App Next.js SSR | Overkill para DEX em SPA; Vite + React é consistente com o resto |

---

## Consequências

- Novo `apps/swap-ui` registrado no workspace pnpm + Turbo.
- Rota bidirecional configurada via env: `VITE_GAME_URL` / `VITE_SWAP_URL`.
- `packages/design-system` marcado como trabalho futuro (deduplicação CSS).
- `apps/frontend` ganha link "Swap" na navbar (env `VITE_SWAP_URL`).
