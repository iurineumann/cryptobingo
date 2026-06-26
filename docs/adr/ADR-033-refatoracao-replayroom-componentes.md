# ADR-033 — Refatoração do ReplayRoom (Componentes + TDD + Estatísticas Globais)

**Status:** Proposto
**Data:** 2026-06-25

---

## Problema

`apps/frontend/src/components/ReplayRoom.tsx` cresceu para **577 linhas** num único componente:
estado local (`showPatterns`, `showSummary`, `density`, `winnerMap`, `patternByName`,
`groupedTickets`, `sortedPatterns`, `summaryStats`), 4 `useEffect`, 4 `useMemo`, e JSX completo.

Custos:

1. **Mesmo problema do ADR-030:** difícil de evoluir — todo polish visual (R1) arrisca regressão.
2. **Sem testes:** zero cobertura.
3. **Duplicação visual:** stage, grid de cartelas, stat bar são quase idênticos aos da GameRoom
   mas implementados inline.
4. **Dados limitados:** só exibe cartelas do jogador logado. Não mostra estatísticas agregadas
   da partida (total de jogadores, cartelas vendidas, pote, pagamentos globais).

## Decisão

### Arquitetura

ReplayRoom segue padrão ADR-030 (GameRoom Fase 0): orquestrador fino + sub-componentes.
`useReplay` é expandido para buscar dados agregados.

```
apps/frontend/src/components/
  ReplayRoom.tsx              # orquestrador (~577→~100 linhas) — mantido no pai por ser o entry point
  replayroom/
    ReplayControls.tsx        # barra: play/pause, restart, skip, velocidade, seek
    ReplaySummary.tsx         # painel de resumo pós-jogo (stats player + agregadas)
    ReplayPatternsPanel.tsx   # painel de padrões simplificado (sem proximidade)
```

`apps/frontend/src/hooks/useReplay.ts` — expandido para buscar dados agregados:
- Tickets de TODOS os jogadores (não só do actor logado) → `aggregateTickets`
- Metadados: totalPlayers, totalTickets, payoutTotal
- Player-specific tickets continuam separados para o grid individual

### Dois entry points

ReplayRoom é acessada de:
1. **Histórico do jogador** (`PlayerHistory`) — `onLeave` volta ao histórico pessoal
2. **Histórico da sala** (`RoomHistory`) — `onLeave` volta ao histórico da sala

A interface `ReplayRoomProps` já suporta ambos (`gameId`, `session`, `onLeave`). O texto do
botão de voltar é definido pela página pai via locale key ou prop futura. Nenhuma mudança
estrutural — apenas a rota que aponta para o componente.

### Reuso de componentes da GameRoom

| Componente | Reusar? | Motivo |
|---|---|---|
| `DrawStage` | Sim | Props: `wsStatus` mockado `"connected"`, `isDrawing=false`, `drawnNumbers=revealedBalls`, idêntico visual |
| `MatchStats` | Sim | Props: `totalWagered`, `sponsorPool` do estado do jogo, `drawnCount`, `maxBalls` |
| `TicketsGrid` | Sim | Props: `playerTickets=tickets`, `loadingGame=isLoading`, `canBuyMore=false`, `completedCombinationsPerTicket=Map()`, resto mapeia direto |
| `PatternsPanel` | **Não** | Interface exige dados de proximidade que só existem ao vivo. `ReplayPatternsPanel` substitui (CSS idêntico, props mínimas). |
| `PrizePanels` | **Não** | Exige `localWinners`, `playerWinEntries`, `nextGame` (live). `ReplaySummary` substitui com stats da partida encerrada. |
| `RoomSocial` | **Não** | Replay é offline — sem socket. |

### `ReplayControls` — componente novo

Barra de controle: play/pause/restart/skip, velocidade (0.5×–8×), seek slider, contador
`revealedBalls / totalBalls`. Sem equivalente na GameRoom.

### `ReplaySummary` — componente adaptado

Substitui `PrizePanels` no contexto replay:
- Banners: golden ball + game ended (mesmo markup)
- Stats do jogador: tokens ganhos, padrões completados (já existente)
- Stats agregadas da partida: total de jogadores, total de cartelas, total pago
- Ações: restart, voltar

### `ReplayPatternsPanel` — simplificado

Substitui `PatternsPanel`:
- Sem `patternProximityMap` / `combinationProximityMap` — só mostra completed vs not
- Sem `completedCombinationsPerTicket` — escopo global, não por jogador
- Mesmo CSS (`gr-patterns`, `gr-pattern`, `is-close`, etc.)

### Dados agregados — expansão do `useReplay`

Atualmente `useReplay` busca:
1. `games` table (estado da partida) — OK, já tem `total_wagered`, `sponsor_pool`
2. `tickets` table filtrado por `session.actor` — só cartelas do jogador

Para estatísticas globais, expande-se para:

```
on-chain (games table):
  total_wagered, sponsor_pool → MatchStats, summary

on-chain (tickets table, sem filtro de actor):
  aggregateTickets[] → totalPlayers (unique actors), totalTickets (length)
  aggregateTickets + patterns → globalWinners[], payoutTotal
```

**Trade-off:** buscar ALL tickets de uma partida via RPC sem paginação pode ser pesado para
partidas com centenas de cartelas. Mitigações:
- No dev/teste o volume é baixo (< 200)
- Produção futura: paginar `get_table_rows` ou criar um contador on-chain
- R0 faz fetch único (same as `PlayerHistory` faz hoje para listar partidas)
- O hook já trata erro silenciosamente (`catch`)

### TDD — estratégia de testes

1. **Teste de caracterização** `ReplayRoom.characterization.test.tsx` trava `data-testid` e
   textos do monólito *antes* da extração. Mantido verde durante todo o refactor.
2. **Testes unitários** para cada componente extraído:
   - `ReplayControls`: renderiza botões, muda velocidade, seek, play/pause
   - `ReplaySummary`: exibe stats com/sem vencedores, stats agregadas
   - `ReplayPatternsPanel`: exibe padrões completed vs not
3. **Expansão do `useReplay.test.ts`:** mock de RPC multi-página para `aggregateTickets`

### CSS

Classes `gr-*` e `gr-replay-*` já existem em `globals.design.css`. Nenhum novo token de design
necessário no R0. R1 (polish) adicionará classes `gr-replay-*`.

## Consequências

**Positivas:**
- Habilita R1 (polish visual) com componentes focados.
- Cobertura de testes.
- Reuso de `DrawStage`/`TicketsGrid`/`MatchStats` elimina duplicação.
- ReplayRoom agora mostra dados globais da partida (não só do jogador).

**Negativas / custos:**
- `useReplay` faz 2 queries RPC adicionais (tickets sem filtro) — latência maior no load.
- Pequena duplicação entre `PatternsPanel` e `ReplayPatternsPanel` (CSS compartilhado, JSX
  similar) — aceito pela clareza de responsabilidade.
- `ReplaySummary` e `PrizePanels` compartilham ~40% de markup sem componente comum — evita
  generalização prematura.

## Alternativas descartadas

1. **Manter monólito.** Proibitivo para evolução e R1.
2. **Forçar reuso de PatternsPanel/PrizePanels com props vazias.** Aumenta acoplamento e
   risco de regressão futura no componente ao vivo.
3. **Componente único com flag `replayMode`.** Bifurcação interna que piora legibilidade.
4. **Calcular estatísticas globais no frontend a partir dos tickets do jogador.** Dados
   incompletos — não mostra o quadro real da partida.

## Referências

- ADR-030 (Arquitetura de Componentes da GameRoom — padrão de refactor seguido)
- `apps/frontend/src/components/ReplayRoom.tsx` (monólito alvo, 577 linhas)
- `apps/frontend/src/hooks/useReplay.ts` (hook expandido)
- `apps/frontend/src/components/gameroom/MatchStats.tsx` (reusado)
- `apps/frontend/src/components/gameroom/TicketsGrid.tsx` (reusado)
- `apps/frontend/src/components/gameroom/DrawStage.tsx` (reusado)
