# CryptoBingo — Visão Geral do Produto

## 1. Visão Geral

O CryptoBingo é uma plataforma descentralizada de bingo construída na blockchain WAX (Antelope). Combina a experiência de usuário fluida da Web2 com a transparência e segurança da Web3 — provadamente justo, auditável e com liquidação financeira instantânea.

**Modelo de negócio:** RTP 85% / GGR 15%. Receita do operador provém da margem entre aposta total e prêmios pagos.

**Duas frentes de atuação:**
- **B2C:** Venda direta de cartelas para jogadores.
- **B2B:** Motor de campanhas patrocinadas — projetos parceiros distribuem seus tokens como prêmios adicionais.

---

## 2. Para Jogadores

### Como funciona

1. O jogador deposita tokens (WAX, BINGO) em sua carteira interna na plataforma.
2. Escolhe uma sala ativa, compra cartelas 5×5 com um ou mais números.
3. Ao fim do período de vendas, o sorteio é acionado on-chain via oráculo WAX — matematicamente impossível de fraudar.
4. As bolas são reveladas uma a uma em tempo real (Slow Reveal). Quando uma cartela completa um padrão vencedor, o prêmio é creditado automaticamente.
5. O jogador pode sacar seus ganhos a qualquer momento.

### Por que jogar no CryptoBingo

- **Provably Fair:** O sorteio acontece na blockchain, não no servidor da plataforma.
- **Sem fricção:** Checkout em lote — compre dezenas de cartelas em uma única transação.
- **Multidrop:** Um mesmo jogo pode pagar prêmios em múltiplos tokens (WAX, BINGO, tokens de parceiros).
- **Fail-safe:** Se algo der errado, o contrato devolve os tokens automaticamente.

### Jornada do jogador

```
Descobrir → Depositar → Escolher sala → Comprar cartelas → Assistir sorteio ao vivo → Receber prêmios → Sacar
```

---

## 3. Para Sponsors (Parceiros B2B)

Projetos podem patrocinar salas de bingo para distribuir seus tokens como prêmio. O sponsor deposita tokens no contrato (trustless — plataforma não tem custódia), aloca por partida, e o contrato distribui automaticamente aos vencedores.

### Benefícios

- **Visibilidade:** Token aparece como prêmio em salas ativas.
- **Volume:** Cada partida patrocinada gera circulação do token.
- **Trustless:** Sponsor mantém controle sobre o depósito — pode reaver saldo não alocado.

### Como funciona

1. Sponsor deposita tokens no contrato.
2. Cria uma campanha com orçamento total e valor por partida.
3. Vincula a campanha a uma ou mais salas.
4. A cada partida, o contrato distribui o valor patrocinado ao vencedor — junto com o prêmio principal.

---

## 4. Para Admins

A plataforma oferece painel administrativo para:

- Gerenciar salas (criar, ativar, pausar, fechar).
- Configurar tipos de jogo (gametypes), padrões vencedores e pesos.
- Calibrar pesos via simulação Monte Carlo para atingir RTP 85%.
- Gerenciar NFTs de utilidade (descontos, acesso VIP).
- Acompanhar métricas de GGR, RTP e volume.

---

## 5. Roadmap (Alto Nível)

> ✅ Implementado · 🚧 Parcial · 🔮 Planejado

### Fundação (Core)

| Funcionalidade | Descrição | ADR | Status |
|---|---|---|---|
| Assinatura contextual anti-replay | ECDSA K1, `recover_key` on-chain, nonce por jogo | ADR-001 | ✅ |
| Arquitetura off-chain + tokenomics | PostgreSQL ledger, MongoDB metadados, BINGO via INO | ADR-002 | ✅ |
| Oráculo de sorteio RNG | `orng.wax` on-chain, daemon TypeScript, provably fair | ADR-003 | ✅ |
| Motor de resolução bitmask | Padrões 5×5, FREE SPACE bit 12, avaliação off+on-chain | ADR-004 | ✅ |
| Economia fixed-odds (RTP/GGR) | 85%/15%, treasury sweep, pricePaid × weight | ADR-005 | ✅ |
| Auth JWT por carteira | Login via assinatura Antelope, RBAC (player/admin/sponsor) | ADR-006 | ✅ |
| FSM completa + Campanhas B2B | CREATED→ARCHIVED, fail-safe ABORTED, GC quarentena 24h | ADR-008 | ✅ |
| Admin Panel | Dashboard admin: salas, gametypes, pesos, métricas | ADR-009 | ✅ |
| Roteamento client-side | React Router v6, deep link, URL como estado | ADR-015 | ✅ |
| Modelo de permissões on-chain | `bingogamectr@admin` threshold, RBAC WAX | ADR-026 | ✅ |

### Jogo e Mecânicas

| Funcionalidade | Descrição | ADR | Status |
|---|---|---|---|
| Salas persistentes (Rooms) | FSM sala, auto-scheduling, preços variáveis, sponsor | ADR-010 | ✅ |
| Drop Vault | Depósito on-chain, alocação por partida, `execdrop` trustless | ADR-011 | ✅ |
| Draw Modes modulares | Standard, Fixed, Golden Ball, First Full | ADR-012 | ✅ |
| Multi-match (Stages) | Estágios progressivos pagantes no mesmo jogo | ADR-013 | ✅ |
| Orquestração de partida | Slow Reveal como gate do avaliador, `autoClaim` | ADR-014 | ✅ |
| Combinações on-chain | `all_of`/`any_of`/`n_of_type`, `combo_id` Mongo↔chain | ADR-016 | ✅ |
| Motor de calibração Monte Carlo | Sugestão de pesos para RTP 85%, simulação backend | ADR-020 | ✅ |

### NFT Mechanics Engine

| Funcionalidade | Descrição | ADR | Status |
|---|---|---|---|
| NFT discount selector | `TICKET_DISCOUNT` por template, aplicado em `buytickets` | ADR-028 §6 | ✅ |
| Burn-to-claim + sync | `BURN_TO_CLAIM`, POST `/nfts/sync-burns`, idempotente | ADR-028 §8 | ✅ |
| Prize Boost on-chain | `PRIZE_BOOST` validado contract+worker, schema field duplo | ADR-028 §7 | ✅ |
| Perfil de jogador | `/profile` — avatar NFT, nickname, histórico XP | ADR-028 §8 | ✅ |
| AtomicAssets local dev | IPFS kubo, AA local para harness E2E | ADR-027 | ✅ |
| NFT consumível (uso único) | Burn → benefício único (XP boost, entrada gratuita) | ADR-028 §9 | 🔮 |

### Plataforma B2B e Conteúdo

| Funcionalidade | Descrição | ADR | Status |
|---|---|---|---|
| Swap B2B (DEX AMM) | `apps/swap-ui` — SwapPage, PoolPage, AnalyticsPage | ADR-018/019/022 | ✅ |
| Multicurrency checkout | Pagamento de cartelas em tokens alternativos via swap | ADR-021 | ✅ |
| Tradução automática híbrida | LibreTranslate + revisão manual, 3 locales (pt/en/zh) | ADR-025 | ✅ |
| Rankings e Leaderboard | Top jogadores por volume/XP, cache Redis 60s | ADR-024 | ✅ |
| FAQ e News feed | FAQ 15 perguntas i18n, news com CRUD admin | ADR-024 | ✅ |
| Chat em tempo real | Socket.io por sala, @mentions, rate limit, JWT auth | — | ✅ |

### Infra e Qualidade

| Funcionalidade | Descrição | ADR | Status |
|---|---|---|---|
| E2E UI Cypress (camadas) | Tier 1 determinístico (fixtures) + Tier 2 real | ADR-017 | ✅ |
| k8s dev/testnet overlays | Kind (dev) + vCluster (testnet), ingress WS/API | — | ✅ |
| Contas mainnet WAX | Mapeamento `bingogamectr`/`bingogamesvc`/treasury mainnet | ADR-023 | ✅ |
| Ambiente staging/prod mainnet | Deploy pipeline mainnet, smoke tests | — | 🔮 |

---

## 6. KPIs de Negócio

- **RTP:** 85% (calibrado por Monte Carlo).
- **Volume B2B:** Mínimo 3 campanhas patrocinadas ativas simultaneamente.
- **Conexões simultâneas:** Suporte a 50.000 conexões WebSocket sem perda de pacotes.
- **Latência do broadcaster:** < 200ms entre revelação da bola e UI do jogador.
