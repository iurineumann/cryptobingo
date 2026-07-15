# ADR-055 — Stats multi-token (WAX + BINGO por sala)

- Status: Proposto
- Data: 2026-07-15
- Decisão: iurineumann

## Contexto

A plataforma paga prêmios em múltiplos tokens. Em testnet hoje: **WAX** e
**BINGO** (`bingogametkn`), dependendo da sala do jogo (`games_history.ticket_symbol`).
O endpoint `GET /api/v1/statistics/summary` (`getPlatformSummary`,
`apps/api-gateway/src/database/ledger.ts:245`) retorna UM objeto com
`currency: 'WAX'` hardcoded e UMA soma global — incorreto para multi-token.

Evidência ao vivo (VPS, 2026-07-15):
- `games_history`: 485 WAX + 152 BINGO (total 637).
- `transactions_ledger`: 121 `claim_win`, `SUM(amount)=1135` (tudo BINGO).
- `games_history` JÁ tem `ticket_price`, `total_tickets`, `total_wagered`,
  `total_paid_out`, `rtp_pct` → RTP por token é calculável (hoje retorna 0
  hardcoded por falta de `total_wagered`).

## Decisão

`getPlatformSummary` deixa de retornar objeto único e passa a retornar:

```ts
{
  totals: { total_games: number; total_players: number },
  by_token: Array<{
    token: string;          // 'WAX' | 'BINGO' (games_history.ticket_symbol)
    total_games: number;
    total_prizes: number;   // SUM(transactions_ledger.amount) WHERE currency=token AND action_type='claim_win'
    avg_rtp_pct: number;    // SUM(total_paid_out)/SUM(ticket_price*total_tickets)*100 agrupado por token
    total_players: number;
  }>;
  generated_at: string;
}
```

- Agregação por `ticket_symbol` (games) e `currency` (ledger).
- RTP real calculado de `games_history` (não hardcoded 0).
- Schema já suporta (colunas existem); não há migração de DB.
- Mantém compatibilidade: `totals` preserva `total_games`/`total_players` globais.

## Consumer impact

- `statisticsController.getPlatformSummaryHandler` (api-gateway) — transparente (repassa json).
- `apps/landing-page/api/stats_game.ts` — tipo do summary deve aceitar `by_token[]`
  (remover `currency: string` obrigatório ou torná-lo opcional/derivado).
- `apps/landing-page/src/lib/api.ts` interface `GameStats` (linha 60-67, tem `currency:string`)
  → refletir `by_token[]` + `totals`.
- Frontend `StatsBar.tsx` — UX HÍBRIDA (decisão usuário 2026-07-15): cards GLOBAIS de
  totals (games_played, active_players) + prize/rtp SEGMENTADO por token (WAX vs BINGO
  lado a lado). Escalável p/ N tokens. Skills `frontend-feature` + `impeccable` na UI.
  Testes `StatsBar.test.tsx` + `__tests__/StatsBar.test.tsx` mockam `by_token[]`. Issue #324.
- `docs/openapi.yaml:460` documenta schema antigo → atualizar no #323.

## Alternativas consideradas

- Manter `currency` único e somar todos tokens sob WAX: rejeitado — mascara
  dados reais (prêmios BINGO exibidos como WAX).
- Coluna `token` separada no games_history: desnecessário — `ticket_symbol` já
  codifica o token da sala.

## Referências

- `apps/api-gateway/src/database/ledger.ts:245` `getPlatformSummary`
- Issue #323 (api-gateway), #324 (frontend), #325 (Loki observability)
