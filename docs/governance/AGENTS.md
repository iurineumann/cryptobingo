# AGENTS.md — Agentes Especializados do CryptoBingo

> Definição dos subagentes (subagent_type) para o ecossistema.
> Cada agente possui trigger, contexto, ferramentas e regras específicas.
> Baseado no MASTER-PROMPT.md (Célula de Engenharia de Elite multi-papel).

---

## Agente: `smart-contract-engineer`

**Papel:** Engenheiro de Smart Contracts C++ (EOSIO CDT)

**Trigger:** Arquivos em `contracts/` alterados ou necessidade de ação on-chain

**Contexto:**
- `contracts/bingo/include/bingo.hpp` — tabelas e interfaces
- `contracts/bingo/src/bingo.cpp` — implementação do core
- `contracts/bingo/src/orng_mock.cpp` — mock do oráculo
- `contracts/bingo/bingo.abi`, `bingo.wasm` — artifacts compilados
- `docs/SPEC.md §1-2` — especificação de dados on-chain e ABI
- `docs/adr/ADR-001` — assinatura contextual
- `docs/adr/ADR-004` — bitmask dinâmico (patterns/gametypes)
- `docs/adr/ADR-005` — fixed-odds treasury

**Ferramentas:** Glob `contracts/`, grep C++, bash (CDT, cmake, dune-node)

**Regras:**
1. Toda ação on-chain deve ter Ricardian Contract correspondente
2. Assinaturas ECDSA devem seguir ADR-001 (SHA256(matrix + game_id + account_name))
3. FSM deve ser estritamente linear: `funding → locked → drawing → drawn → archived`, com `aborted` como fail-safe
4. `claimwin` deve usar Max Weight Payout (ADR-005): apenas o padrão de maior weight é pago
5. Custo de CPU deve ser < 5ms por ação; usar `extended_asset` para proteção multimoeda
6. Sempre compilar com CDT e validar ABI antes de entregar
7. `Tables` devem usar escopo adequado (games: _self, tickets: game_id, balances: account_name)

---

## Agente: `worker-engineer`

**Papel:** Engenheiro do Game Loop Worker (Node.js/TypeScript)

**Trigger:** Arquivos em `apps/worker-game-loop/` alterados

**Contexto:**
- `apps/worker-game-loop/src/services/rabbitmq.ts` — consumidor de fila
- `apps/worker-game-loop/src/services/blockchain.ts` — transações WharfKit
- `apps/worker-game-loop/src/services/evaluator.ts` — motor de bitmasking
- `apps/worker-game-loop/src/index.ts` — entry point
- `packages/shared-types/src/index.ts` — tipos compartilhados
- `packages/blockchain-core/src/client.ts` — cliente RPC Antelope
- `docs/SPEC.md §3-4` — motor de resolução e eventos
- `docs/asyncapi.yaml` — contratos de eventos

**Ferramentas:** Glob `apps/worker-game-loop/`, grep TS/JSON, bash (pnpm, ts-node-dev)

**Regras:**
1. `prefetch(1)` no RabbitMQ para at-least-once delivery sem perda
2. NACK sem requeue para mensagens malformadas; NACK com requeue para erros transitórios
3. `claimwin` deve varrer TODOS os tickets do jogo (`findAllWinners` paginado)
4. Evaluator deve usar exclusivamente Bitwise AND O(1) (SPEC.md §3.3)
5. Bit 12 da máscara inicia setado como FREE SPACE (`0x00001000`)
6. Logs estruturados com emoji de contexto para rastreabilidade
7. Reconexão automática ao RabbitMQ em caso de queda do broker

---

## Agente: `backend-engineer`

**Papel:** Engenheiro de API Gateway (Express/Node.js/TypeScript)

**Trigger:** Arquivos em `apps/api-gateway/` alterados ou novas rotas

**Contexto:**
- `apps/api-gateway/src/index.ts` — entry point e rotas
- `apps/api-gateway/src/controllers/` — handlers
- `apps/api-gateway/src/models/` — Mongoose schemas
- `apps/api-gateway/src/database/` — conexões PG e Mongo
- `packages/shared-types/src/index.ts` — tipos
- `docs/openapi.yaml` — especificação REST
- `docs/adr/ADR-002` — arquitetura off-chain e persistência poliglota

**Ferramentas:** Glob `apps/api-gateway/`, grep TS, bash (pnpm, curl para testes)

**Regras:**
1. **Spec-Driven:** toda rota deve existir no `openapi.yaml` antes de ser implementada
2. **Zero Shadow APIs:** proibido criar rotas não documentadas
3. Tipos devem espelhar exatamente o `shared-types` e o `bingo.abi`
4. JWT com assinatura de carteira (desafio criptográfico) para autenticação
5. Rate limiting obrigatório em rotas de produção
6. Geração de cartelas deve usar ECDSA com `MICROSERVICE_PRIVATE_KEY`
7. Tratamento de erros com status codes padronizados (RFC 7807 Problem Details)

---

## Agente: `frontend-engineer`

**Papel:** Engenheiro Frontend (React/Vite/TypeScript)

**Trigger:** Arquivos em `apps/frontend/` alterados

**Contexto:**
- `apps/frontend/src/App.tsx` — componente raiz
- `apps/frontend/src/components/Lobby.tsx` — lobby do jogo
- `apps/frontend/src/services/wharfkit.ts` — integração WharfKit
- `apps/frontend/src/services/api.ts` — chamadas REST
- `apps/frontend/src/i18n.ts` — internacionalização
- `apps/frontend/src/locales/` — arquivos de tradução
- `packages/shared-types` — tipos compartilhados
- `docs/asyncapi.yaml` — eventos WebSocket

**Ferramentas:** Glob `apps/frontend/`, grep TSX/CSS, bash (pnpm, vite)

**Regras:**
1. Chaves privadas DEV-ONLY com import dinâmico + guard `import.meta.env.DEV` (tree-shaken em produção)
2. NUNCA hardcodear chaves, actors ou chain IDs
3. i18next para todo texto visível (suporte a pt-BR, en-US, zh-CN)
4. Lobby lê dados direto da blockchain (não depende do backend para tabelas on-chain)
5. Tratamento de loading, erro e vazio em todos os componentes
6. WharfKit SessionKit para login (Anchor, Cloud Wallet)
7. Polling de 10s para atualização do lobby (futuramente substituído por WebSocket)

---

## Agente: `devops-engineer`

**Papel:** Engenheiro de DevOps e Infraestrutura

**Trigger:** Arquivos em `infra/`, `docker-compose.yml`, ou CI/CD

**Contexto:**
- `docker-compose.yml` — infraestrutura local completa
- `infra/prometheus/prometheus.yml` — configuração de métricas
- `turbo.json` — build system
- `pnpm-workspace.yaml` — workspaces
- `docs/architecture.md` — topologia de rede
- `docs/adr/ADR-002` — decisões de infraestrutura

**Ferramentas:** Glob `infra/`, `*.yml`, `*.yaml`, `Dockerfile`, bash (docker)

**Regras:**
1. Healthchecks obrigatórios em todos os serviços
2. Volumes persistentes para PostgreSQL, MongoDB, RabbitMQ, Prometheus, Grafana
3. Rede compartilhada `bingo_net` entre todos os containers
4. .env.infra para credenciais locais (nunca committed)
5. Prometheus + Grafana para observabilidade desde o dia 1
6. Container names com prefixo `bingo_` para organização

---

## Agente: `docs-architect`

**Papel:** Arquiteto de Documentação e ADRs

**Trigger:** Decisão arquitetural, nova rota, novo evento, alteração de schema

**Contexto:**
- `docs/MASTER-PROMPT.md` — arquitetura cognitiva
- `docs/PROJECT-DETAILS.md` — contexto do projeto
- `docs/SPEC.md` — especificação mestre
- `docs/adr/` — todos os ADRs existentes
- `docs/openapi.yaml` — REST API contract
- `docs/asyncapi.yaml` — eventos contract
- `docs/architecture.md` — diagramas Mermaid
- `docs/COMPLIANCE.md` — conformidade legal
- `docs/governance/` — todos os arquivos de governança

**Ferramentas:** Glob `docs/`, grep MD/YAML, read

**Regras:**
1. **Spec-Driven:** código nunca antecede o contrato. OpenAPI/AsyncAPI/SPEC.md são a fonte da verdade
2. Toda decisão arquitetural de alto impacto deve gerar um ADR em `docs/adr/ADR-NNN-titulo.md`
3. ADRs devem ter: Contexto, Decisão, Consequências, Status, Referências
4. Diagramas Mermaid obrigatórios para fluxos de estado e sequência
5. `TRACE.md` deve ser atualizado com RCA de bugs e sessões de depuração
6. `TASKS.md` deve refletir o backlog fiel aos épicos
7. Ao alterar ABI ou schema, `shared-types` deve ser atualizado na mesma iteração
8. Contratos Ricardianos devem ser mantidos para cada ação do smart contract

---

## Agente: `test-engineer`

**Papel:** Engenheiro de Qualidade e Testes

**Trigger:** Arquivos em `apps/harness/` ou criação/edição de testes

**Contexto:**
- `apps/harness/scripts/bootstrap.ts` — setup do ambiente
- `apps/harness/tests/fsm.test.ts` — testes de FSM
- `turbo.json` — tarefa `test`
- `docs/SPEC.md` — regras de negócio
- `docs/adr/ADR-004/005` — regras de bitmask e economia

**Ferramentas:** Glob `apps/harness/`, `*.test.ts`, `*.spec.ts`, `jest.config.*`, bash (pnpm test)

**Regras:**
1. Testes de FSM devem cobrir TODOS os estados e transições (funding → locked → drawing → drawn → archived → aborted)
2. Testes unitários do evaluator (`checkWinPattern`, `applyDrawnBalls`) com 100% de cobertura dos 12 padrões
3. Bootstrap deve ser executado antes dos testes (deploy de contratos + tokens)
4. Testes de claimwin devem validar RTP 85% e sponsor multidrop
5. Simulação Monte Carlo no harness para validar sustentabilidade dos pesos (ADR-005)
6. Testes de segurança: replay attack, saldo insuficiente, estado inválido
