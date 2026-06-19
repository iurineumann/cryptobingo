# ADR-029 — Adoção de ShadCN/ui no Frontend

**Status:** Proposto
**Data:** 2026-06-18

---

## Problema

O frontend (React + Vite + TS) possui componentes de UI totalmente custom:
`cb-btn`, `cb-badge`, `cb-modal`/`cb-overlay`, `cb-input`/`cb-select`,
menus dropdown manuais, etc. Essa abordagem tem custos acumulados:

1. **Acessibilidade inconsistente.** Modal não tem focus trap nativo. Menu `⋮`
   usa overlay manual (`position: fixed; inset: 0`) pra fechar ao clicar fora —
   sem navegação por teclado, sem `role="menu"` completo, sem gerenciamento de
   foco. Cada componente reinventa ARIA do zero.
2. **Duplicação de padrões.** Botão primário, outline, ghost precisam ser
   reimplementados em toda superfície. `globals.design.css` já tem 722 linhas de
   CSS custom, muito dele para componentes genéricos que bibliotecas resolvem.
3. **Sem estado consistente.** Hover, focus, active, disabled, loading — cada
   componente implementa um subconjunto diferente. Sem garantia de cobertura.
4. **Custo de onboarding.** Novo dev precisa aprender API custom em vez de
   padrão conhecido (Button, Dialog, Select).

---

## Decisão

Adotar **ShadCN/ui** como camada de componentes de UI do frontend, mantendo
componentes de domínio (TicketCard, BallDisplay, ChatFloating, BuyTicketModal
stepper, etc.) como custom — ShadCN não cobre esses.

ShadCN é uma coleção de componentes React copiáveis sobre Radix UI primitives
+ Tailwind v4. As primitives já entregam acessibilidade, foco, teclado e ARIA
corretos; o estilo fica sob nosso controle via Tailwind e CSS vars.

---

## Estratégia de migração (incremental, dual system)

```
Fase 0: Setup
  ├── npx shadcn@latest init -c apps/frontend
  ├── Adicionar path alias @/ em vite.config.ts + tsconfig.json
  ├── Mapear --cb-* tokens no @theme inline do globals.css
  └── Adicionar tw-animate-css

Fase 1: Componentes genéricos (substituição direta)
  ├── Button      → cb-btn, cb-btn-primary/outline/ghost/danger
  ├── Badge       → cb-badge, cb-badge-success/neutral
  ├── Dialog      → cb-modal + cb-overlay (focus trap, escape, aria)
  ├── DropdownMenu → menu ⋮ (posicionamento, teclado, escape nativos)
  ├── Select      → select de idioma (cb-select)
  ├── Progress    → cb-progress-track/fill
  ├── Skeleton    → spinner de loading (cb-spinner)
  └── Sonner      → toasts (inexistente hoje)

Fase 2: Superfícies
  ├── GameRoom  → DropdownMenu (⋮), Dialog (BuyTicketModal)
  ├── Lobby     → Badge, Button, Skeleton
  ├── LandingPage → Button
  └── Admin     → Select, Dialog, Table

Fase 3: Limpeza
  ├── Remover CSS morto (cb-btn, cb-modal, etc. de globals.design.css)
  ├── Remover cb-badge-nft, cb-badge-token (substituído por Badge + variant)
  └── Verificar cobertura de estados em todos os componentes
```

Cada fase é independente e pode ser revertida sem afetar as anteriores. Não
exige migração total em uma sprint.

---

## Mapeamento de tokens

```
--cb-bg-base          → --background
--cb-text-primary     → --foreground
--cb-bg-card          → --card
--cb-brand            → --primary
--cb-accent           → --accent (ou --warning)
--cb-success          → --success (ou --chart-2)
--cb-danger           → --destructive
--cb-border-default   → --border
--cb-border-subtle    → --border * 0.6 opacity
--cb-text-secondary   → --muted-foreground
--cb-text-tertiary    → --muted-foreground * 0.6 opacity
```

Tokens de domínio BINGO (`--color-bingo-b`, `--ball-color`, `--cell-color`)
permanecem como `--cb-*` e não são mapeados pro ShadCN — são específicos do
jogo e não fazem sentido como tokens de UI genérica.

---

## Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Conflito entre `--cb-*` e ShadCN `--background/foreground` | Mapear `--cb-*` para `@theme inline`; ShadCN usa as vars novas, código legado usa as antigas |
| Dual system temporário confunde devs | Documentar em CLAUDE.md: "preferir ShadCN para componentes novos; migrar legado na Fase 2" |
| Customização de tema fica mais verbosa | ShadCN é CSS var + Tailwind — mesma abordagem que já usamos, só que com nomes padronizados |
| ShadCN depende de Radix (mais dependências) | Radix é leve, tree-shakeable, mantido pela WorkOS. ~10 pacotes adicionais |
| BuyTicketModal stepper é complexo para Dialog | Manter custom. Dialog substitui só o wrapper overlay/modal, não o conteúdo |

---

## Componentes que NÃO entram na migração

- `TicketCard` / `TicketGrid` — grade 5×5 BINGO, domínio puro
- `BallDisplay` / `gr-ball-hero` — visualização de sorteio
- `ChatFloating` — chat overlay com drag/resize
- `BuyTicketModal` stepper — fluxo de compra multi-etapa (o *wrapper* pode virar Dialog)
- `TicketCard` / `gr-bingo-grid` / `gr-pattern` — grade de padrões
- `LandingPage` hero / why-grid / audit-trail — elementos de marketing sem equivalente ShadCN

---

## Próximos passos

1. Aceitar ADR → setup CLI + path alias
2. Implementar Fase 0 (setup)
3. Migrar `⋮` menu do GameRoom para `<DropdownMenu>` (prova de conceito de acessibilidade)
4. Migrar `cb-modal` para `<Dialog>` no BuyTicketModal
5. Expandir para demais superfícies

---

## Referências

- [ShadCN/ui docs](https://ui.shadcn.com/docs)
- [Radix UI Primitives](https://www.radix-ui.com/primitives)
- [Tailwind v4 + ShadCN guide](https://ui.shadcn.com/docs/tailwind-v4)
- ADR-017 (E2E UI) — testes com componentes padronizados
