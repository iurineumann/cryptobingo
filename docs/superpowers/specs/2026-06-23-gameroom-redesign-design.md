# Spec — GameRoom Redesign (imersiva, dinâmica, interativa)

- **Data:** 2026-06-23
- **Autor:** Célula de Engenharia (Iuri + Claude)
- **Status:** Aprovado para planejamento
- **Escopo:** Redesenho + novos recursos de engajamento + quebra do monolito `GameRoom.tsx`
- **Abordagem:** Decomposição incremental por fases (B), com feature flag no cutover visual final (C)

---

## 1. Motivação

A `GameRoom.tsx` atual (1176 linhas, monólito) entrega a função mas não prende a atenção do
jogador. Queremos uma sala **mais realista, dinâmica e interativa** em quatro frentes:

1. **Sorteio** — cinematográfico, com tensão e ritmo (não bolas aparecendo instantaneamente).
2. **Cartelas** — vivas, com feedback de marcação e alerta de quase-vitória (near-miss).
3. **Social** — presença ao vivo, reações, feed de eventos, chat mais integrado.
4. **Prêmios e dados** — premiações do jogador, premiações da sala para a partida envolvendo todos os jogadore, breakdown animado, stats da partida/sala, celebração.

Restrições duráveis: paridade real desktop/mobile (futuro de embeds Telegram/Discord/WhatsApp),
fluxo ADR + GitHub Project + git flow, RTP 85% / GGR 15% intocados, PT-BR.

## 2. Estado atual (baseline)

- **Frontend:** `apps/frontend/src/components/GameRoom.tsx` (monólito). Regiões hoje: `gr-navbar`,
  palco `gr-ball-hero`, `gr-patterns` (aside), `gr-golden-banner`, `gr-stages-panel`,
  `gr-ended-breakdown`, `gr-tickets-section`, `ChatFloating`. Estilos `gr-*` em
  `globals.design.css`. Multi-tema (Feltro Verde / Alta Roda / Cobre & Cosmos) via
  `data-palette` + localStorage já existente.
- **Tempo real:** `useSlowReveal` (Socket.io, Broadcaster, ADR-007); `/chat` namespace com rooms
  (`chatSocket.ts`); `leaderboardController` já existe. Sem presença/reações/feed ainda.
- **Utils:** `ticketUtils` com `computePatternUserProximity` / `computeCombinationProximity`
  (proximity já calculada — base pronta p/ near-miss).

## 3. Arquitetura-alvo (componentes isolados)

`GameRoom.tsx` vira **orquestrador fino**. Lógica de estado migra p/ hook; UI quebra em unidades
com responsabilidade única, interface clara e testáveis isoladamente:

| Componente                | Responsabilidade                                                    | Depende de              |
| ------------------------- | ------------------------------------------------------------------- | ----------------------- |
| `useGameRoomState` (hook) | Estado consolidado: RPC do jogo + `useSlowReveal` + derivados       | api, useSlowReveal      |
| `<DrawStage>`             | Palco do sorteio: bola hero animada, trilha de histórico, countdown | useGameRoomState        |
| `<PatternsPanel>`         | Padrões/combos/stages + proximidade                                 | ticketUtils             |
| `<TicketsGrid>`           | Cartelas do jogador agrupadas                                       | TicketCard, ticketUtils |
| `<PrizePanels>`           | Pote/jackpot, breakdown, stats, celebração                          | useGameRoomState        |
| `<RoomSocial>`            | Presença, reações, feed de eventos, chat integrado                  | socket `/chat`          |

Princípios: cada unidade entendível sem ler internals; props/interfaces explícitas; arquivos
focados (sinal de excesso = arquivo grande). Componentes isolados habilitam **modo compacto**
futuro (embeds) sem reescrever.

## 4. Decomposição em fases

Cada fase = **1 issue → add ao Project #4 → branch `feature/<slug>` de `develop` → commits PT-BR
`tipo(escopo):` → PR `Closes #N` para `develop` → ADR (quando estrutural) + `/sonar-analyze` +
testes verdes + revisor da camada**. `master` só recebe `develop` estável.

> ⚠️ **Pré-requisito:** branch atual `fix/multimatch-slow-reveal` mergeada e `develop` atualizado
> antes da Fase 0.

### Fase 0 — Refactor base (sem mudança de comportamento)

- Quebrar `GameRoom.tsx` nos componentes da §3. Comportamento **idêntico**; testes baseline verdes.
- **ADR-030:** arquitetura de componentes da GameRoom.
- Revisor: `frontend-reviewer`. Skills: `frontend-feature`.
- **Critério de aceite:** UI pixel-equivalente; vitest + Cypress Tier 1 verdes; nenhum `gr-*`
  removido sem equivalente.

### Fase 1 — Sorteio cinematográfico

- Bola hero animada (roleta/queda), pulso de cor B-I-N-G-O por coluna, trilha de histórico
  animada, countdown tenso entre bolas, som opcional (toggle persistido, default off).
- Respeita o ritmo do Slow Reveal (ADR-007) — animação dirigida por Sequence ID, sem inventar bolas.
- **ADR-031:** UX do palco de sorteio (timings, acessibilidade `prefers-reduced-motion`).
- Revisor: `frontend-reviewer`. Skills: `impeccable` + `frontend-feature`.
- **Aceite:** animação respeita `prefers-reduced-motion`; reconciliação de Sequence ID intacta;
  sem regressão de performance (60fps alvo desktop).

### Fase 2 — Cartelas vivas + near-miss

- Marcação pop/glow ao bater bola; destaque de célula prestes-a-fechar; alerta "falta 1!";
  barra de progresso por padrão/combo na própria cartela. Reusa proximity de `ticketUtils`.
- Revisor: `frontend-reviewer`. Skills: `impeccable` + `frontend-feature`.
- **Aceite:** near-miss correto vs proximity existente; sem falso "falta 1" (testes unit ticketUtils).

### Fase 3 — Prêmios + dados + celebração

- Pote/jackpot da sala em destaque; breakdown de prêmios animado ao ganhar; stats da partida
  (bolas tiradas, jogadores, RTP/GGR da sala); modal + confete de vitória.
- Dados de prêmio derivam de `pricePaid × base_multiplier × weight/100 × golden` (ADR-010) — **sem
  recalcular economia no front**, só exibir o que worker/chain já resolvem.
- Revisor: `frontend-reviewer`. Skills: `impeccable` + `frontend-feature`.
- **Aceite:** valores exibidos batem com payout on-chain; celebração só em vitória confirmada.

### Fase 4 — Social ao vivo

- **Backend (api-gateway):** eventos socket **efêmeros** no namespace `/chat` — presença
  (online count por room derivado de membership), reações flutuantes (emoji), feed de eventos
  ("Fulano fez linha!"). **Sem nova coleção Mongo** (estado efêmero/in-memory). Leaderboard da
  sala reusa `leaderboardController`.
- **Frontend:** `<RoomSocial>` consome os eventos; chat deixa de ser só floating.
- **ADR-032:** presença/reações/feed efêmeros no socket. **AsyncAPI** atualizado.
- Revisores: `api-reviewer` + `frontend-reviewer`. Skills: `api-endpoint` + `frontend-feature`.
- **Aceite:** rate-limit em reações (anti-spam, espelha `chat:send`); presença consistente em
  reconexão; sem vazamento de PII no feed; testes de segurança do socket verdes.

### Fase 5 — Cutover

- Flag `GameRoomV2` (já dogfooded nas fases) vira default; remove legado; limpa a flag.
- Revisor: `frontend-reviewer`.
- **Aceite:** flag removida; legado deletado; Cypress Tier 1 + Tier 2 verdes.

## 5. Trade-offs e decisões

- **Por que B (incremental) e não rewrite:** PRs pequenos/revisáveis, fases verdes, casa com fluxo
  ADR/board; ganho visual gradual é aceitável vs risco de big-bang.
- **Flag só no cutover:** evita duplicação prolongada de código; dá troca segura em prod.
- **Social efêmero (sem Mongo):** presença/reações/feed são transitórios; persistir seria custo
  sem valor. Chat persiste como hoje (`ChatMessage`).
- **Animação dirigida por Sequence ID:** mantém invariante do Slow Reveal (ADR-007); front não
  inventa bolas.

## 6. Riscos

- **Performance de animação** (Fase 1) — mitigar com `prefers-reduced-motion`, throttling, GPU
  transforms. Alvo 60fps desktop, degradação graciosa mobile.
- **Presença em reconexão** (Fase 4) — Socket.io adapter rooms podem contar fantasmas; usar
  `disconnect` + TTL.
- **Regressão no refactor** (Fase 0) — mitigada por baseline de testes antes de tocar visual.

## 7. Fora de escopo (YAGNI)

- Persistência de reações/feed; analytics histórico de social.
- Modo embed real (Telegram/Discord) — só **habilitado** pela arquitetura, não implementado aqui.
- Mudanças em contrato C++, worker de payout, ou economia.

## 8. Entregável de skills

Cada fase usa `frontend-feature` (+ `impeccable` no visual, `api-endpoint` na Fase 4). Se um gap
de procedimento recorrer entre fases, ao fim cria-se/melhora-se a skill `gameroom-feature` como
entrega "definitiva" reutilizável.
