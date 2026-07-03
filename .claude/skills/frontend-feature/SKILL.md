---
name: frontend-feature
description: >
  Convenções do frontend do CryptoBingo (React + Vite + TS) para criar/alterar
  componentes: i18n obrigatório em 3 locales, design system (globals.design.css),
  sessão Wharfkit/leitura on-chain, services/api.ts, Fast Refresh e testes vitest.
  Use ao mexer em apps/frontend/src/**.
---

# Frontend — Convenções de feature

Pacote `@cryptobingo/frontend` (React + Vite + TS). Testes: **vitest** —
`pnpm --filter @cryptobingo/frontend test` (NÃO há `jest`). Typecheck: `npx tsc --noEmit` (ok aqui).

## Regras obrigatórias

1. **i18n em 3 locales SEMPRE.** Toda string visível usa `t('namespace.chave')` (react-i18next).
   Adicionou chave? Ela DEVE existir em `src/locales/pt.json`, `en.json` e `zh.json` (as três).
   `pt` é a referência. Namespaces por área (ex.: `game_room`, `admin`).
2. **Design system.** Use as classes/tokens de `src/styles/globals.design.css` (prefixo `cb-`:
   `cb-btn`, `cb-card`, `cb-input`, vars `--cb-*`). Não invente CSS ad-hoc nem cores hardcoded;
   estenda o design system. Componentes de sala usam o prefixo `gr-`.
3. **On-chain (Wharfkit).** Leituras via `session.client.v1.chain.get_table_rows` (use
   `UInt64.from(id)` em bounds i64; scope de tickets = game_id como name). Helpers em
   `components/ticketUtils.ts` e `packages/blockchain-core`. `VITE_CONTRACT_ACCOUNT` = `bingogamectr`.
4. **API.** Centralize chamadas REST em `src/services/api.ts` (tipadas). Não faça `fetch` solto em
   componente.
5. **Fast Refresh.** Não exporte funções utilitárias junto com componentes no mesmo arquivo (quebra
   o HMR do Vite) — utilitários em `*Utils.ts` (ex.: `ticketUtils.ts`).
6. **Pesos/prêmios.** Pesos em hundredths; multiplicador exibido = `weight/100`. Prêmio =
   `pricePaid × multiplicador` (ADR-010) — use o preço pago pela cartela, não o valor padrão da sala.

## Domínio que costuma confundir

- **Combinações (ADR-016)** vêm de `fetchPublicGametypeMetadata` (cláusulas/tipos off-chain) e são
  exibidas no painel de padrões + agrupadas na "Partida Encerrada". Combos aninhados sobrepostos:
  só o de maior peso conta (`detectComboWinsForTicket` resolve por peso).
- **Bitmask 5×5:** índice 12 = FREE SPACE (sempre on). Padrão = 25 células row-major.
- Admin: cadastro/edição de gametypes e combinações em `components/admin/GametypesAdmin.tsx`
  (salvar combinações sincroniza on-chain via API).

## SonarQube (obrigatório antes de cada commit)

- Rode `sonarqube_analyze_code_snippet` em cada `.ts`/`.tsx` modificado
- Corrija BLOCKER/CRITICAL/MAJOR — zero tolerância antes do commit
- MINOR aceitável com justificativa inline
- NOSONAR só com comentário explicando o motivo
- Varredura só após testes verdes

## Checklist

- [ ] Strings via `t(...)` com chaves em pt/en/zh.
- [ ] Estilos via design system (`cb-*`/`gr-*`), sem CSS/cor hardcoded.
- [ ] Utilitários separados de componentes (Fast Refresh).
- [ ] Chamadas REST em `services/api.ts`; leituras on-chain com bounds `UInt64`.
- [ ] `npx tsc --noEmit` limpo + `vitest run` verde.
