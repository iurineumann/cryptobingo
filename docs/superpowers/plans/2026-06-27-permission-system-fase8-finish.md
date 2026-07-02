# Fase 8 — Finalização: Build, Sonar, Deploy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** Verificar qualidade, documentar decisão, buildar e deployar api-gateway + frontend.

**Dependencies:** Todas as fases 1-7 completas.

---

## Global Constraints

- SonarQube em cada TS/TSX modificado.
- ADR-036 já criado — revisar se precisa atualizar após implementação.
- Typecheck passa em todos os pacotes.
- Testes verdes em todos os pacotes tocados.
- Build passa para api-gateway (Docker) + frontend (Vite).
- Deploy manual (GitHub Actions não funciona).

---

## Arquivos

| Ação | Arquivo | Descrição |
|------|---------|-----------|
| Edit | `docs/adr/ADR-036-permission-system.md` | Revisar status para "Implementado" (se deployado) |
| Misc | Vários | Sonar, typecheck, testes, build, deploy |

---

### Task 1: SonarQube — Revisão de qualidade

- [ ] **Step 1: Rodar `/sonar-analyze` em cada arquivo modificado**

Arquivos a verificar:

**API Gateway:**
- `apps/api-gateway/src/models/SponsorOrg.ts`
- `apps/api-gateway/src/models/SponsorDelegation.ts`
- `apps/api-gateway/src/models/AuditLog.ts`
- `apps/api-gateway/src/utils/permissionMatcher.ts`
- `apps/api-gateway/src/utils/audit.ts`
- `apps/api-gateway/src/middleware/requirePerm.ts`
- `apps/api-gateway/src/controllers/permissionController.ts`
- `apps/api-gateway/src/controllers/sponsorPermissionController.ts`
- `apps/api-gateway/src/controllers/profileController.ts`
- `apps/api-gateway/src/index.ts`
- `apps/api-gateway/src/models/UserProfile.ts`

**Frontend:**
- `apps/frontend/src/utils/permissionMatcher.ts`
- `apps/frontend/src/App.tsx`
- `apps/frontend/src/components/admin/AdminLayout.tsx`
- `apps/frontend/src/components/admin/UsersAdmin.tsx`
- `apps/frontend/src/components/admin/SponsorsAdmin.tsx`
- `apps/frontend/src/components/sponsor/SponsorLayout.tsx`
- `apps/frontend/src/components/sponsor/SponsorDelegations.tsx`
- `apps/frontend/src/services/api.ts`

**Shared:**
- `packages/shared-types/src/index.ts`

- [ ] **Step 2: Corrigir issues BLOCKER/CRITICAL/MAJOR**

Sonar pode apontar:
- Tratamento de erro genérico (`catch (err)` → log mais específico)
- `any` types → substituir por interfaces
- Magic strings → constantes nomeadas

---

### Task 2: Typecheck + Testes

- [ ] **Step 1: Typecheck API Gateway**
  ```bash
  npx tsc --project tsconfig.build.json --noEmit
  ```
  (rodar em `apps/api-gateway/`)

- [ ] **Step 2: Testes API Gateway**
  ```bash
  cd apps/api-gateway && npx jest --coverage
  ```

- [ ] **Step 3: Typecheck Frontend**
  ```bash
  cd apps/frontend && npx tsc --noEmit
  ```

- [ ] **Step 4: Testes Frontend**
  ```bash
  pnpm --filter @cryptobingo/frontend test
  ```

- [ ] **Step 5: Testes Harness (se aplicável)**
  Verificar se harness precisa de atualização.

---

### Task 3: Build

- [ ] **Step 1: Build API Gateway (Docker)**
  ```bash
  docker build -t cryptobingo-api-gateway:latest -f apps/api-gateway/Dockerfile .
  ```

- [ ] **Step 2: Build Frontend**
  ```bash
  VITE_RPC_URL=https://waxtestnet.greymass.com \
  VITE_API_GATEWAY_URL=<api-gateway-url> \
  VITE_CHAIN_ID=f16b1833c747c43682f4386fca9cbb327929334a762755ebec17f6f23c9b8a12 \
  VITE_CONTRACT_ACCOUNT=bingogamectr \
  VITE_SWAP_CONTRACT=bingogameswp \
  pnpm --filter @cryptobingo/frontend build
  ```

---

### Task 4: Deploy

- [ ] **Step 1: Deploy API Gateway**

```bash
# Tag + push to ACR
docker tag cryptobingo-api-gateway:latest cryptobingoacr.azurecr.io/cryptobingo-api-gateway:perm-system-<hash>
docker push cryptobingoacr.azurecr.io/cryptobingo-api-gateway:perm-system-<hash>

# Deploy to ACA
az containerapp update \
  --name api-gateway \
  --resource-group cryptobingo \
  --image cryptobingoacr.azurecr.io/cryptobingo-api-gateway:perm-system-<hash>
```

- [ ] **Step 2: Deploy Frontend (SWA)**

```bash
npx -y @azure/static-web-apps-cli deploy \
  apps/frontend/dist \
  --deployment-token <token> \
  --env production \
  --app-location apps/frontend/dist
```

- [ ] **Step 3: Verificar deploy**
  - Frontend: carregar URL, login, verificar admin menu
  - API: `GET /api/v1/admin/users` deve retornar 200 com token admin

---

### Task 5: Atualizar ADR

- [ ] **Step 1: Revisar ADR-036**

Se necessário, adicionar detalhes que emergiram durante implementação:
- Mudanças no schema
- Endpoints adicionais
- Edge cases de segurança

Atualizar status:
```md
**Status:** Implementado (2026-06-27)
```

---

### Task 6: Git Flow

- [ ] **Step 1: Commits por fase (já devem estar feitos)**

Padrão: `tipo(escopo): descrição` seguido de `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`

Exemplos:
```
feat(perm): modelos SponsorOrg + SponsorDelegation + AuditLog
feat(perm): middleware requirePerm com pattern matching
feat(perm): endpoints admin de permissões e delegações
feat(perm): endpoints sponsor self-service
feat(perm): frontend nav filtrada por permissões
feat(perm): UsersAdmin editor de permissões
feat(perm): SponsorsAdmin gestão de delegações
feat(perm): sponsor self-service delegations page
```

- [ ] **Step 2: Criar PR para develop**

```bash
gh pr create \
  --base develop \
  --title "feat(perm): RBAC+Perms — permissões granulares, delegação sponsor, audit trail" \
  --body "**Closes #N**

## O que
Sistema de permissões granulares (RBAC+Perms) com delegação sponsor multi-nível e audit trail completo.

## Modelo
- UserProfile.permissions[] — permissões explícitas
- SponsorOrg — organização do sponsor master
- SponsorDelegation — delegação para sub-contas
- AuditLog — append-only de ações sensíveis

## Permissions namespace
\`\`\`
admin.* | admin.users.manage | admin.sponsors.view | sponsor.{orgId}.rooms.manage | ...
\`\`\`

## Endpoints (8 novos)
- PUT /admin/users/:wallet/permissions
- GET/POST /admin/sponsor-orgs[/:orgId]/delegations
- GET/POST/DELETE /sponsor/delegations

## Frontend
- Nav AdminLayout filtrada por permissões
- UsersAdmin com editor de permissões
- SponsorsAdmin (gestão de orgs + delegações)
- SponsorDelegations (self-service)

## Segurança
- delegations.manage não delegável (previne escalada)
- AuditLog em toda ação sensível
- contract_admin bypassa requirePerm

## TDD
- permissionMatcher.test.ts (backend + frontend)
- requirePerm.test.ts
- adminPermissions.test.ts + sponsorPermissions.test.ts
- AdminLayout.permissions.test.tsx
- UsersAdmin.test.tsx + SponsorsAdmin.test.tsx
- SponsorDelegations.test.tsx

Ref: ADR-036"
```

---

### Task 7: Verificação final pós-deploy

- [ ] **Step 1: Login como bingogamectr → role contract_admin → admin menu completo**
- [ ] **Step 2: Verificar que nav só mostra seções com permissão**
- [ ] **Step 3: Testar editor de permissões (admin.users.manage)**
- [ ] **Step 4: Verificar AuditLog populado no MongoDB**
  ```bash
  mongosh --quiet --eval "db.auditlogs.find().sort({createdAt:-1}).limit(5).pretty()"
  ```
- [ ] **Step 5: Verificar que sponsor delegado só acessa o que tem perm**
