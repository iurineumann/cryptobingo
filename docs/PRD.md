# PRD — Product Requirements Document: CryptoBingo

**Propósito:** Descrever requisitos funcionais e não-funcionais da plataforma CryptoBingo.
**Público:** Time de produto e engenharia.
**Domínio:** Bingo GameFi on-chain (WAX/Antelope).
**Documentos relacionados:** `SPEC.md` (especificação técnica), `CONTEXT.md` (glossário), `COMPLIANCE.md` (conformidade).

> Requisitos marcados com ✅ estão implementados, 🚧 parcialmente implementados, 🔮 planejados.
> Consulte `SPEC.md` para detalhes de implementação de cada requisito.

---

## 1. Introdução

Plataforma descentralizada de bingo de quota fixa na WAX. Opera em modelo Web2.5: checkout e renderização off-chain com velocidade de Web2, liquidação financeira e sorteio on-chain com segurança Web3.

**Economia:** RTP 85% / GGR 15%. Prêmio calculado por max_weight entre padrões batidos na cartela.

---

## 2. Personas

| Persona | Descrição | Objetivo principal |
|---|---|---|
| **Player** | Jogador casual ou frequente | Comprar cartelas, assistir sorteio, receber prêmios |
| **Sponsor** | Projeto parceiro (B2B) | Depositar tokens para distribuir como prêmio em salas |
| **Admin** | Operador da plataforma | Configurar salas, gametypes, calibrar pesos, monitorar |
| **Auditor** | Regulador ou terceiro | Verificar fair play, RTP, conformidade legal |

---

## 3. User Stories (Épicos)

### 3.1. Player

| ID | Épico | Prioridade |
|---|---|---|
| US-P-01 | Comprar cartelas em sala ativa e participar do sorteio | Alta |
| US-P-02 | Acompanhar sorteio ao vivo com revelação de bolas | Alta |
| US-P-03 | Receber prêmios automaticamente ao vencer | Alta |
| US-P-04 | Depositar e sacar tokens da carteira interna | Alta |
| US-P-05 | Visualizar histórico de jogos e resultados | Média |
| US-P-06 | Usar NFT de utilidade para desconto/boost no prêmio (ADR-028) | Média | ✅ |
| US-P-07 | Participar de salas com múltiplos modos de sorteio | Média |
| US-P-08 | Receber drops de tokens/NFTs de patrocinadores | Média |
| US-P-09 | Acompanhar presença e reações de outros jogadores na sala (ADR-032) | Baixa | ✅ |
| US-P-10 | Rever replay de jogos anteriores com controles de seek/speed (ADR-033) | Média | ✅ |

### 3.2. Sponsor

| ID | Épico | Prioridade |
|---|---|---|
| US-S-01 | Depositar tokens no contrato para campanhas | Alta |
| US-S-02 | Vincular campanha a salas específicas | Alta |
| US-S-03 | Acompanhar distribuição de tokens por partida | Média |
| US-S-04 | Reaver saldo não alocado de campanhas encerradas | Média |

### 3.3. Admin

| ID | Épico | Prioridade |
|---|---|---|
| US-A-01 | Gerenciar salas (criar, ativar, pausar, fechar) | Alta |
| US-A-02 | Configurar gametypes, padrões e pesos | Alta |
| US-A-03 | Calibrar pesos via simulação Monte Carlo | Alta |
| US-A-04 | Gerenciar NFTs de utilidade | Média |
| US-A-05 | Visualizar métricas de RTP, GGR e volume | Média |
| US-A-06 | Executar sweep de GGR para tesouraria | Alta |
| US-A-07 | Gerenciar conteúdo do news feed | Baixa |

### 3.4. Auditor

| ID | Épico | Prioridade |
|---|---|---|
| US-U-01 | Verificar integridade do sorteio on-chain | Alta |
| US-U-02 | Consultar RTP/GGR público por período | Alta |
| US-U-03 | Auditar ledger de transações | Média |

---

## 4. Requisitos Funcionais

### 4.1. Ciclo de Jogo ✅

- Jogo segue FSM: `CREATED → FUNDING → LOCKED → DRAWING → DRAWN → PAYING → ARCHIVED`
- Fail-safe: `LOCKED | DRAWING | PAYING → ABORTED` com reembolso.
- Worker orquestra transições automáticas (autoLock, autoDraw, autoClaim).
- Ao arquivar, quarentena de 24h antes de limpar RAM da tabela `tickets`.
- Ref: `SPEC.md §1.2` (tabela `games`), `SPEC.md §3.4` (orquestração).

### 4.2. Cartelas e Checkout ✅

- Matriz 5×5 com FREE SPACE no bit 12.
- Geração off-chain com assinatura ECDSA do microserviço.
- `buytickets()` valida assinatura via `recover_key` on-chain.
- Preço variável por sala (min/max/default).
- Pagamento via ledger interno (`balances`), não por transferência avulsa.
- Ref: `SPEC.md §2.1`, `CONTEXT.md §Ticket`.

### 4.3. Draw Modes e Payout ✅

**✅ Standard/Fixed:** Sorteio de N bolas, paga max_weight ao vencedor.

**✅ Golden Ball:** Bola especial (posição configurável) que multiplica prêmio.

**✅ First Full:** Sorteio até primeira cartela completar padrão MASTER.

**✅ Multi-match (Stages):** Múltiplos estágios pagantes no mesmo jogo.

**✅ Combinações:** Vitória por combinação de padrões (all_of, any_of, n_of_type). `combo_id` alinhado entre Mongo e chain.

**Fórmula de prêmio (max_weight):**
`Prize = paid_ticket_price × base_multiplier × win_weight / 100 × golden_multiplier`

Ref: `SPEC.md §2.2` (claimwin), `SPEC.md §2.3` (stages), `SPEC.md §1.7` (gametypes), ADR-012, ADR-013, ADR-016.

### 4.4. Salas (Rooms) ✅

**✅ On-chain:** FSM `inactive → active ⇌ paused → closed`. Tabela `rooms` com preços, gametype, sponsor, drop chance.

**✅ Auto-scheduling:** `roomManager.ts` cria nova partida automaticamente ao encerrar anterior, com `autoStartDelaySec` configurável.

**✅ Metadados off-chain:** Nome, descrição, cover image, chat config (MongoDB `roommetadata`), via `setroommeta`.

Ref: `SPEC.md §1.5`, `SPEC.md §2.4`, ADR-010.

### 4.5. Patrocínio B2B (Campaigns) ✅

**✅ On-chain:** Tabela `campaigns` com budget, payout por jogo, leftover policy. Sponsor deposita tokens via memo `campaign:{id}`.

**✅ `setcampaign`:** Admin ou sponsor configura `payout_per_game` e `leftover_policy` (refund/house) em campanha existente.

**✅ API:** `GET/POST /api/v1/sponsors/campaigns`, `POST .../link` (`linkcampaign`), `POST .../close` (`closecmpgn`).

**✅ Harness E2E:** 6 suites validando ciclo completo (deposit → setcampaign → linkcampaign → auth guards).

Ref: `SPEC.md §1.4`, ADR-008.

### 4.6. Drop Vault ✅

**✅ On-chain:** Tabelas `dropdeposits`, `dropallocs`, singleton `dropstate`. Depósitos via `on_notify` de transfer com memo `vault`.

**✅ Worker:** `dropWorker.ts` com 3 fases (pré-check → seleção → distribuição). Execução de `execdrop()`. Ciclo completo testado no harness.

Ref: `SPEC.md §1.6`, ADR-011.

### 4.7. NFTs e Utilidades ✅

**✅ nftconfigs:** Tabela on-chain que mapeia template_id a benefícios (discount_pct, PRIZE_BOOST, SCHEMA_FIELD, BURN_TO_CLAIM, VIP, validade). Aplicado em `buytickets()`.

**✅ BURN_TO_CLAIM (ADR-028 §9):** Burn do NFT consumível ativa bônus de prêmio no jogo. Implementado no worker (`nftMechanics.ts`, `burnCron.ts`).

**✅ SCHEMA_FIELD (ADR-028 §8):** Benefício lido do schema do asset (imutável por template), sem necessidade de `nftconfigs`.

**✅ Backed Tokens:** NFTs da coleção `cryptobingo` com lastro BINGO (AtomicAssets), liberado ao burn.

**🔮 Desconto na service_fee do swap (ADR-019 Phase 2):** Desconto por template_id em `bingogameswp` — implementação pendente.

Ref: `SPEC.md §5.2`, `CONTEXT.md §NFT & Utilidades`, ADR-028.

### 4.8. WebSocket Slow Reveal ✅

- Eventos em tempo real por canal `game.{game_id}`.
- Broadcaster revela 1 bola a cada ~3s a partir do array resolvido.
- Reconciliação via `sync_request / sync_response` em caso de perda de pacote.
- Eventos: `ball_drawn`, `winner_found`, `golden_ball`, `stage_cleared`, `game_ended`.
- Chat em tempo real por sala via Socket.io (`@mentions`, rate limit 5msg/5s, JWT auth).
- Suporte a 50.000 conexões simultâneas (🔮 load test pendente).

Ref: `SPEC.md §4`, ADR-007.

### 4.9. Rankings e Conteúdo ✅

- News feed com suporte a locale (PT, EN, ZH).
- Rankings de jogadores por volume, vitórias, XP.
- FAQ estática i18n pt/en/zh (15 perguntas por locale).
- Cache Redis TTL 60s nos endpoints de leaderboard.

Ref: ADR-024.

### 4.10. Swap B2B ✅

- Troca de BINGO por tokens de parceiros (e vice-versa).
- App dedicado `apps/swap-ui` (SwapPage, PoolPage, AnalyticsPage), acessível via `VITE_SWAP_URL`.
- API: `GET /api/v1/swap/pools` e `/api/v1/swap/quote`.
- Taxa de serviço sobre swap.

Ref: ADR-018, ADR-019, ADR-022.

### 4.11. Multicurrency Checkout ✅

- Suporte a múltiplos tokens como moeda de pagamento nas salas (via `bingogameswp`).
- Cotação on-chain com expiração; swap integrado ao `BuyTicketModal` (ADR-021).
- Apenas pares diretos — multi-hop reservado para ADR futuro.

Ref: ADR-021.

### 4.12. GameRoom — Componentes e UX de Sorteio ✅

- Monolito GameRoom (1218 linhas) decomposto em 6 componentes reutilizáveis (ADR-030).
- Sorteio cinematográfico com revelação de bola por coluna + pulso de suspense (ADR-031).
- Near-miss detection: alerta "Falta 1!" + destaque da célula que fecha padrão (Fase 2).
- MatchStats: pote da partida, bônus, bolas restantes (Fase 3).
- Presença ao vivo, reações efêmeras e event feed via Socket.io (ADR-032, Fase 4).
- Som opcional de chamada de bola (default off), suporte a reduced motion.
- i18n pt/en/zh em toda a experiência de sala.

Ref: ADR-030, ADR-031, ADR-032.

### 4.13. ReplayRoom — Replay de Jogos Anteriores ✅

- Monolito ReplayRoom (577 linhas) decomposto em 3 componentes (ADR-033).
- Controles: play/pause, restart, speed, seek.
- `ReplaySummary`: banners + aggregate stats por jogador.
- Entry points context-aware: ReplayPage (avulso), PlayerHistory, RoomHistory.
- 38 testes de cobertura.

Ref: ADR-033.

### 4.14. Autenticação — Deep Links e Persistência ✅

- JWT migrado de `sessionStorage` para `localStorage` (persiste entre abas).
- Re-auth silencioso via `authenticateSession` em nova aba ou JWT expirado.
- Deep links funcionais sem re-login (ex: `/room/{id}` aberto diretamente).

Ref: ADR-034.

---

## 5. Requisitos Não-Funcionais

| Requisito | Descrição | Status |
|---|---|---|
| **Latência broadcaster** | < 200ms entre revelação e UI do jogador | 🚧 (não aferido) |
| **Conexões simultâneas** | 50.000 WebSocket sem perda de pacotes | 🔮 (load test pendente) |
| **RTP** | 85% ± 2% calibrado por Monte Carlo | ✅ |
| **Provably Fair** | Sorteio via oráculo on-chain `orng.wax` | ✅ |
| **Assinatura de cartelas** | ECDSA K1, validada via `recover_key` | ✅ |
| **Audit trail** | Ledger PostgreSQL com toda movimentação financeira | ✅ |
| **Conformidade legal** | Lei 14.790/2023 (apostas de quota fixa) | ✅ |
| **Segurança** | Modelo de permissões RBAC on-chain (ADR-026) | ✅ |

Ref: `COMPLIANCE.md` para detalhes de conformidade.

---

## 6. Non-Goals

- Operações fiduciárias (PIX, cartão de crédito) — v1.0 é crypto-to-crypto.
- Hardware wallet (Ledger) — planejado pós-lançamento.
- Jogos com dealer ao vivo ou interação síncrona entre jogadores.
- Suporte a redes que não sejam Antelope (WAX) — v1.0.

---

## 7. Glossário

Ver `CONTEXT.md` para definições completas de domínio.
