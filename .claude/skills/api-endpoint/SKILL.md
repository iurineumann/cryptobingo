---
name: api-endpoint
description: >
  Como adicionar/alterar um endpoint no api-gateway do CryptoBingo seguindo nossos
  padrões: rota + controller, auth (JWT) + RBAC + rate limit, transações on-chain via
  admin session, metadados MongoDB, cache Redis, OpenAPI e testes. Use ao mexer em
  apps/api-gateway/src/{index.ts,controllers,middleware} ou criar rotas REST.
---

# API-gateway — Adicionar/alterar endpoint

Pacote `@cryptobingo/api-gateway` (Express + TS). Testes: `npx jest <arquivo>`. Typecheck:
`npx tsc --project tsconfig.build.json --noEmit`. Specs: `docs/openapi.yaml` (+ `asyncapi.yaml`).

## Anatomia

- **Rotas:** registradas em `src/index.ts` na ordem `app.<verb>(path, <limiter>, [requireAuth,
  requireRole('admin')], handler)`.
- **Controllers:** `src/controllers/*.ts` (um por domínio: pattern, room, ticket, nft, sponsor,
  drop, statistics, winnings, monteCarlo, profile, auth, health).
- **Middleware:** `middleware/auth.ts` (`requireAuth` — JWT), `middleware/rbac.ts`
  (`requireRole('admin')`), `middleware/rateLimiter.ts` (`playerLimiter` | `adminLimiter`).

## Padrões obrigatórios

1. **Auth/RBAC/limite:** rota pública → `playerLimiter`. Rota admin → `adminLimiter, requireAuth,
   requireRole('admin')`. Nunca exponha mutação on-chain sem auth.
2. **Transação on-chain:** use o padrão `getAdminSession()` (Wharfkit, assina como
   `bingogamectr@active` com `MICROSERVICE_PRIVATE_KEY`) → `session.transact({ actions:[{ account:
   CONTRACT_ACCOUNT, name, authorization:[session.permissionLevel], data }] }, { broadcast:true })`.
   Trate erro e retorne `transaction_id`. Veja `patternController.upsertGametype`.
3. **Metadados off-chain:** MongoDB via Mongoose models (ex.: `GametypeMetadataModel`). On-chain é a
   fonte de verdade de valores que afetam prêmio (pesos); Mongo guarda metadados/descritivos.
   Ao gravar algo que tem reflexo on-chain, **sincronize on-chain** e invalide o cache Redis
   (`pattern:gametype:{id}`). Ver `upsertGametypeMetadata` (ADR-016) — falha de sync = erro explícito.
4. **Cache:** Redis com TTL alinhado ao worker (`PATTERN_CACHE_TTL` = 1h). Invalide ao mutar.
5. **Validação:** valide entrada e retorne 400 com mensagem clara antes de tocar chain/Mongo.
   Pesos em hundredths (1–25500).
6. **NUNCA** engula erro silenciosamente (`.catch(()=>{})`). Surface para o cliente.

## SonarQube (obrigatório antes de cada commit)

- Rode `sonarqube_analyze_code_snippet` em cada `.ts`/`.tsx` modificado
- Corrija BLOCKER/CRITICAL/MAJOR — zero tolerância antes do commit
- MINOR aceitável com justificativa inline
- NOSONAR só com comentário explicando o motivo
- Varredura só após testes verdes

## Checklist ao adicionar endpoint

- [ ] Handler no controller + rota em `index.ts` com limiter/auth corretos.
- [ ] Validação de input (400) antes de efeitos colaterais.
- [ ] On-chain (se aplicável) via `getAdminSession`; invalida cache; erro explícito em drift.
- [ ] Atualizar `docs/openapi.yaml` (e `asyncapi.yaml` se for evento/WS).
- [ ] Teste em `controllers/<nome>.test.ts` (+ `.security.test.ts` se mexer em auth/RBAC).
- [ ] Tipos compartilhados em `@cryptobingo/shared-types` quando refletirem structs do contrato.

## Erros comuns

- Rota admin sem `requireRole('admin')` → bypass de autorização.
- Gravar em Mongo sem sincronizar/invalidar o que o worker lê on-chain → drift.
- Esquecer de atualizar `openapi.yaml` → spec desatualizada.
