# SKILLS.md — Habilidades Reutilizáveis do CryptoBingo

> Workflows reutilizáveis que os agentes podem carregar via `skill` tool.
> Cada skill define passo a passo como executar uma tarefa comum.

---

## Skill: `cpp-contract`

**Descrição:** Compilar, testar e validar smart contracts C++ (EOSIO CDT)

**Trigger:** Arquivos em `contracts/` alterados

**Workflow:**
1. Ler `contracts/bingo/include/bingo.hpp` — verificar se novas ações/tabelas foram declaradas
2. Ler `contracts/bingo/src/bingo.cpp` — verificar se ações implementadas correspondem ao .hpp
3. Compilar com CDT:
   ```bash
   cd contracts/bingo && cdt-cpp -abigen -o bingo.wasm src/bingo.cpp -I include/
   ```
4. Validar ABI gerado contra `docs/SPEC.md §1-2` (tabelas, ações, tipos)
5. Executar testes de FSM no harness:
   ```bash
   pnpm --filter @cryptobingo/harness test
   ```
6. Verificar custo de CPU:
   ```bash
   wasm-objdump -d contracts/bingo/bingo.wasm | grep "func" | wc -l
   ```
7. Se `patterns` ou `gametypes` foram alterados, atualizar `docs/adr/ADR-004`

**Contextos relacionados:** AGENTS.md → `smart-contract-engineer`, ADR-001, ADR-004, ADR-005

---

## Skill: `game-loop-worker`

**Descrição:** Implementar ou depurar o worker de game loop

**Trigger:** Arquivos em `apps/worker-game-loop/` alterados

**Workflow:**
1. Ler `apps/worker-game-loop/src/services/rabbitmq.ts` — confirmar consumo da fila `game_loop_events`
2. Ler `apps/worker-game-loop/src/services/blockchain.ts` — validar sessão WharfKit e transações
3. Ler `apps/worker-game-loop/src/services/evaluator.ts` — verificar bitmasking:
   - Constantes `WIN_PATTERNS` (12 máscaras)
   - `applyDrawnBalls`: lookup O(1) com Set, mapeamento bit_index ↔ matrix_index
   - `checkWinPattern`: Bitwise AND contra cada máscara
   - `findAllWinners`: paginação com `get_table_rows`
4. Executar worker em modo dev:
   ```bash
   pnpm --filter @cryptobingo/worker-game-loop dev
   ```
5. Testar fluxo completo via RabbitMQ:
   ```bash
   # Publicar evento de lockgame
   amqp-publish -e "" -r game_loop_events -b '{"action":"lockgame","gameId":"1"}'
   ```

**Contextos relacionados:** AGENTS.md → `worker-engineer`, SPEC.md §3-4, ADR-004

---

## Skill: `react-frontend`

**Descrição:** Desenvolver ou depurar o frontend React

**Trigger:** Arquivos em `apps/frontend/` alterados

**Workflow:**
1. Verificar `.env` local: `VITE_DEV_ACTOR`, `VITE_DEV_PRIVATE_KEY`, `VITE_CHAIN_ID`, `VITE_RPC_URL`
2. Iniciar dev server:
   ```bash
   pnpm --filter @cryptobingo/frontend dev
   ```
3. Verificar WharfKit:
   - SessionKit com plugins: Anchor, CloudWallet, PrivateKey (dev-only)
   - Login/restore/logout funcionando
4. Verificar i18n:
   - Arquivos em `locales/` (pt-BR, en-US, zh-CN)
   - `useTranslation()` nos componentes
   - Seletor de idioma persiste no MongoDB
5. Verificar Lobby:
   - Leitura de `games_table` e `balances_table` via RPC
   - Polling de 10s
   - Estados de loading/erro/vazio
6. Tree-shaking:
   - `WalletPluginPrivateKey` importado apenas com `import.meta.env.DEV`
   - Botão de dev renderizado condicionalmente

**Contextos relacionados:** AGENTS.md → `frontend-engineer`, PROJECT-DETAILS.md §7

---

## Skill: `api-gateway`

**Descrição:** Implementar ou depurar rotas do API Gateway

**Trigger:** Arquivos em `apps/api-gateway/` alterados

**Workflow:**
1. Verificar `docs/openapi.yaml` — confirmar que a rota existe na spec
2. Ler controllers e models atuais
3. Se nova rota: adicionar no `openapi.yaml` PRIMEIRO, depois implementar
4. Tipos: atualizar `packages/shared-types/src/index.ts` se necessário
5. Conectar banco: MongoDB para perfis/gamificação, PostgreSQL para ledger
6. Testar com curl:
   ```bash
   curl http://localhost:8083/api/v1/health
   ```
7. Segurança: rate limiting, Helmet, CORS configurado, JWT validado

**Contextos relacionados:** AGENTS.md → `backend-engineer`, openapi.yaml, ADR-002

---

## Skill: `adr-docs`

**Descrição:** Criar ou atualizar Architecture Decision Records e documentação

**Trigger:** Decisão arquitetural de alto impacto

**Workflow:**
1. Identificar necessidade: nova tabela, novo fluxo, mudança de infraestrutura
2. Criar arquivo `docs/adr/ADR-NNN-titulo-descritivo.md` com template:
   ```markdown
   # ADR-NNN: Título da Decisão

   ## Status
   [Proposto | Aceito | Depreciado | Substituído]

   ## Contexto
   [Problema que motivou a decisão]

   ## Decisão
   [O que foi decidido e por quê]

   ## Consequências
   ### Positivas
   [Benefícios]

   ### Negativas/Riscos
   [Trade-offs e riscos]

   ## Referências
   [Links para SPEC.md, código, outros ADRs]
   ```
3. Atualizar `docs/SPEC.md` se a decisão afeta a especificação mestre
4. Atualizar diagramas Mermaid em `docs/architecture.md`
5. Se afeta API: atualizar `docs/openapi.yaml` ou `docs/asyncapi.yaml`
6. Se afeta tipos: atualizar `packages/shared-types/src/index.ts`
7. Registrar no `TRACE.md`

**Contextos relacionados:** AGENTS.md → `docs-architect`, todos os ADRs em `docs/adr/`

---

## Skill: `test-harness`

**Descrição:** Executar testes de integração e bootstrap do ambiente

**Trigger:** Necessidade de validar fluxo FSM completo

**Workflow:**
1. Subir infraestrutura:
   ```bash
   docker compose up -d
   ```
2. Executar bootstrap (deploy contratos + criar tokens):
   ```bash
   pnpm --filter @cryptobingo/harness bootstrap
   ```
3. Executar testes de FSM:
   ```bash
   pnpm --filter @cryptobingo/harness test
   ```
4. Verificar cobertura:
   - Fluxo completo: creategame → deposit → buytickets → lockgame → startdraw → receiverand → claimwin → withdraw
   - Casos de erro: estado inválido, saldo insuficiente, replay attack
5. Simulação Monte Carlo (ADR-005):
   - Validar que pesos dos padrões mantêm RTP entre 85%-95%

**Contextos relacionados:** AGENTS.md → `test-engineer`, ADR-004, ADR-005, SPEC.md

---

## Skill: `infra-docker`

**Descrição:** Gerenciar infraestrutura Docker local

**Trigger:** docker-compose.yml, infra/ alterados

**Workflow:**
1. Verificar `docker-compose.yml` — healthchecks, volumes, portas
2. Subir serviços:
   ```bash
   docker compose up -d
   ```
3. Verificar healthchecks:
   ```bash
   docker compose ps
   ```
4. Acessar interfaces:
   - PostgreSQL: `localhost:5432`
   - MongoDB: `localhost:27017`
   - RabbitMQ Management: `localhost:15672`
   - Prometheus: `localhost:9090`
   - Grafana: `localhost:3001` (admin/bingo_grafana_2026)
   - cAdvisor: `localhost:8082`
   - pgAdmin: `localhost:5050`
5. Logs:
   ```bash
   docker compose logs -f [service_name]
   ```

**Contextos relacionados:** AGENTS.md → `devops-engineer`, ADR-002
