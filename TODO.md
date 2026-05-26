# TODO.md — Tarefas Imediatas e Dívidas Técnicas

## [DONE] Sprint — ABI Manual + Ricardian + Tailwind v4 (2026-05-26)

### Contrato — ABI Manual
[DONE] bingo.abi reescrito manualmente e sincronizado com bingo.hpp sprint atual.
[DONE] Todas as novas structs adicionadas: campaign_record, game_state com end_time/gametype_id.
[DONE] Todas as novas actions documentadas: fundgame, abortgame, refundticket, cleargame, linkcampaign, closecampaign.
[DONE] Tabela campaigns adicionada com secondary index bysponsor.
[DONE] win_pattern_mask corrigido de uint32 para uint64 (alinhado ao bingo.hpp).
[DONE] ricardian_clauses adicionadas: terms-of-service e dispute-resolution (inglês, padrão WAX Mainnet).

### Contrato — Ricardian Contracts (formato WAX)
[DONE] bingo.contracts.md reescrito em inglês com formato WAX correto (<h1 class="contract">).
[DONE] Todos os 17 actions documentados com Intent + Terms + variáveis {{campo}}.
[DONE] Contratos Ricardianos inline no bingo.abi (campo ricardian_contract de cada action).
[DONE] Referências à legislação brasileira (Lei 14.790/2023) nos contratos relevantes.

### Frontend — Tailwind CSS v4
[DONE] package.json — tailwindcss@^4.0.0, @tailwindcss/vite@^4.0.0, vite@^5.0.0 adicionados.
[DONE] vite.config.ts — plugin tailwindcss() integrado (deve vir antes do react plugin).
[DONE] src/styles/globals.css — Design System completo com @theme (CSS-first, sem tailwind.config.js):
       - 9 escalas de cores customizadas (brand, accent, surface, bingo columns, semantic)
       - Tokens de tipografia: Inter + Space Grotesk + JetBrains Mono
       - Fluid type scale com clamp() (6 tamanhos)
       - Sombras customizadas com glow effects para UI de gaming
       - Transições e animações: spin, pulse, fade-in, slide-up, ball-drop, winner-glow
       - @layer components: cb-btn, cb-card, cb-badge, cb-input, cb-modal, cb-bingo-grid, cb-ball, etc.
[DONE] Modo escuro (padrão) + modo claro via [data-theme="light"] na <html>.
[DONE] src/hooks/useTheme.ts — hook com persistência em localStorage + syncing do data-theme.
[DONE] src/main.tsx — importa globals.css, inicializa tema sem flash (anti-FOUC).
[DONE] index.html — fontes Google (Inter, Space Grotesk, JetBrains Mono), anti-FOUC script inline, meta theme-color.
[DONE] App.tsx — migrado completamente para classes Tailwind, barra de XP, navbar responsiva, theme toggle.

## [DONE] Migração completa de componentes para Tailwind v4 (2026-05-26)
[DONE] Lobby.tsx — inline styles removidos. Grid responsivo com auto-fill. Cards com glow na borda quando assistindo. Status chips com cb-status-*. dl/dt/dd semântico para dados financeiros. Acima da dobra: saldo + refresh. Promise.all para carregar dados em paralelo.
[DONE] BuyTicketModal.tsx — cb-overlay + cb-modal + cb-slide-up. Quick-select 1×/3×/5×/10×. cb-btn-loading spinner nativo. aria-modal, aria-live, aria-busy. Resumo de custo em bg-sunken glassmorphism.
[DONE] TicketGrid.tsx — cb-bingo-grid + cb-bingo-cell. COL_VAR mapeado para --color-bingo-*. Animação cb-ball-drop na célula recém marcada via prop lastDrawn. role="grid" + aria-selected para acessibilidade.
[DONE] BallDisplay.tsx — cb-ball cb-ball-lg com animação cb-ball-drop a cada nova bola. Gloss effect radial-gradient. cb-winner-glow pulsante no banner de vitória. cb-status-dot-live pulsante. Bolas pequenas com color-mix() para opacidade dinâmica.

## [DEBT] Dívidas Técnicas Residuais
[DEBT] ADR-005: auto-sweep de GGR para tesouraria não implementado.
[DEBT] broadcaster.ts: sem limite de conexões por IP.
[DEBT] fsm.test.ts: fundgame() não adicionado — vai falhar com o novo estado CREATED.

## [NEXT] Sprint 2 do Roadmap — Sponsors B2B
[ ] sponsorController.ts — CRUD de campanhas no api-gateway.
[ ] Frontend admin — painel de campanhas com saldo e jogos vinculados.
[ ] openapi.yaml — endpoints de campaigns documentados.
