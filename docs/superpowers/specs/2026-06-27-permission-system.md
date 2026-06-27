# Spec — RBAC+Perms: Permissões Granulares + Delegação Sponsor

- **Data:** 2026-06-27
- **Autor:** Célula de Engenharia (Iuri + Claude)
- **Status:** Aprovado para planejamento
- **Escopo:** Substituir RBAC (5 papéis rígidos) por RBAC+Perms com permissões granulares e delegação sponsor multi-nível
- **Abordagem:** Spec-driven, fases paralelizáveis via subagents, TDD em cada fase

---

## 1. Motivação

RBAC atual (`player | moderator | sponsor | admin | contract_admin`) é simples mas rígido:

1. **Admin tudo-ou-nada:** não existe admin "restrito" — todo admin pode tudo (gerir NFTs, tokens, usuários, salas). Impede delegar responsabilidades sem dar acesso total.
2. **Sponsor sem delegação:** um sponsor master não pode criar sub-contas que gerenciem partes específicas (ex: "fulano gerencia drops dessa sala", "ciclano vê tesouraria").
3. **UI cega:** nav do admin mostra todas as seções mesmo sem permissão — confunde e polui.
4. **Sem audit trail granular:** não sabemos *quem* fez *o quê* — só o papel.

## 2. Modelo Proposto: RBAC+Perms

Duas camadas complementares:

```
┌─ Role (coarse gate) ────►  admin/sponsor/player/contract_admin
│     define: acesso à seção (ex: /admin/*, /sponsor/*)
│
└─ Permissions (fine gate) ►  admin.users.manage
      define: ação específica dentro da seção
      armazenado: UserProfile.permissions[] + SponsorDelegation.permissions[]
```

### Hierarquia de decisão

```
request → requireRole('admin')? → requirePerm('admin.users.manage')?
              │                        │
              ▼                        ▼
        403 se não admin         403 se não tem perm
```

`contract_admin` bypassa ambos (atual, mantido).

### Sponsor master + delegados

```
SponsorOrg (owner = wallet A)
  ├─ wallet A: permissions = ['sponsor.{orgId}.*']  (master — tudo)
  ├─ wallet B: permissions = ['sponsor.{orgId}.treasury.view']  (delegado — só ver tesouraria)
  └─ wallet C: permissions = ['sponsor.{orgId}.rooms.room_123.manage']  (delegado — sala específica)
```

## 3. Namespace de Permissões

### Admin

```
admin.*                                    # super admin (todas as perms admin)
  admin.dashboard.view                     # KPIs e métricas
  admin.rooms.manage                       # CRUD salas
  admin.patterns.manage                    # padrões on-chain
  admin.gametypes.manage                   # gametypes + metadados
  admin.users.view                         # listar usuários
  admin.users.manage                       # editar role/permissões de outros
  admin.sponsors.view                      # ver orgs sponsor
  admin.sponsors.manage                    # criar/modificar sponsors
  admin.tokens.manage                      # tokens do sistema
  admin.nfts.manage                        # config NFTs
  admin.campaigns.manage                   # campanhas B2B
  admin.vault.manage                       # vault global
  admin.compliance.view                    # ledger/RTP
  admin.news.manage                        # notícias/promoções
  admin.config.manage                      # config do sistema
```

### Sponsor (escopo por organização)

```
sponsor.{orgId}.*                          # master — tudo do org
  sponsor.{orgId}.dashboard.view           # visão geral do org
  sponsor.{orgId}.rooms.manage             # todas as salas do org
  sponsor.{orgId}.rooms.{roomId}.manage    # sala específica
  sponsor.{orgId}.nfts.manage              # config NFTs da sala
  sponsor.{orgId}.treasury.view            # ver saldo da tesouraria
  sponsor.{orgId}.treasury.withdraw        # sacar da tesouraria
  sponsor.{orgId}.drops.manage             # gerenciar drops
  sponsor.{orgId}.campaigns.manage         # campanhas
  sponsor.{orgId}.layouts.manage           # layout das salas
  sponsor.{orgId}.delegations.manage       # delegar permissões a sub-contas
```

## 4. Data Model

### 4.1 `UserProfile` (modificado)

```
UserProfile {
  ...
  role:         'player' | 'moderator' | 'sponsor' | 'admin' | 'contract_admin'
  permissions:  string[]  ← NOVO
}
```

- Admin recebe `['admin.*']` ao ser promovido
- Sponsor master recebe `['sponsor.{orgId}.*']` ao ser promovido
- Delegados recebem permissões específicas via SponsorDelegation

### 4.2 `SponsorOrg` (novo)

```
SponsorOrg {
  _id:            ObjectId
  orgId:          string    (unique, ex: "org_b1ng0")
  owner_wallet:   string    (wallet do sponsor master)
  name:           string    (ex: "Bingo do João")
  settings: {
    autoApproveDelegations: boolean (default: true)
  }
  createdAt:      Date
  updatedAt:      Date
}
```

**Regras:**
- Criado automaticamente quando user é promovido a `sponsor`
- `orgId` gerado via nanoid ou hash do wallet (ex: `org_` + nanoid(8))
- Owner wallet não pode ser deletada — apenas transferida para outro wallet

### 4.3 `SponsorDelegation` (novo)

```
SponsorDelegation {
  _id:            ObjectId
  orgId:          string    (ref SponsorOrg)
  wallet_address: string    (delegate)
  permissions:    string[]  (ex: ['sponsor.{orgId}.treasury.view'])
  delegated_by:   string    (wallet do master que delegou)
  active:         boolean   (default: true)
  createdAt:      Date
  updatedAt:      Date
}

Index: { orgId: 1, wallet_address: 1 }  (unique compound)
Index: { wallet_address: 1 }            (busca rápida por wallet)
```

**Regras:**
- Um wallet só pode ter 1 delegação ativa por org
- Se master cria delegação para wallet que já existe, atualiza permissões
- Delegação não pode auto-atribuir `sponsor.{orgId}.delegations.manage` — só master nativo tem
- Se master perde role sponsor, todas as delegações do org são desativadas

## 5. Permission Matcher (Pattern Matching)

```
admin.*                           → match: admin.users.manage, admin.dashboard.view, ...
sponsor.org_abc.*                 → match: sponsor.org_abc.rooms.manage, ...
sponsor.*.treasury.view           → match: sponsor.org_abc.treasury.view, sponsor.org_xyz.treasury.view
admin.users.manage                → match: admin.users.manage (exato)
```

Implementação: `minimatch` (já disponível via dependências do frontend), ou função custom simples com split por `.` + wildcard.

## 6. Auto-atribuição

| Evento | Ação |
|--------|------|
| `contract_admin` (`bingogamectr`) faz login | `permissions = []` (bypass no middleware) |
| Role `admin` atribuída via `assignRole` | `permissions = ['admin.*']` |
| Role `sponsor` atribuída | Cria `SponsorOrg` (se não existe) + `permissions = ['sponsor.{orgId}.*']` |
| Role rebaixada de admin/sponsor | Permissions viram `[]` |
| GET /profile | Permissions retornadas no payload (`permissions: string[]`) |

## 7. Endpoints

### 7.1 Admin (protegidos por `requirePerm`)

| Método | Rota | Permission | Descrição |
|--------|------|------------|-----------|
| `PUT` | `/api/v1/admin/users/:wallet/permissions` | `admin.users.manage` | Atualiza permissions de um user |
| `GET` | `/api/v1/admin/sponsor-orgs` | `admin.sponsors.view` | Lista orgs com paginação |
| `GET` | `/api/v1/admin/sponsor-orgs/:orgId` | `admin.sponsors.view` | Detalhe do org |
| `POST` | `/api/v1/admin/sponsor-orgs/:orgId/delegations` | `admin.sponsors.manage` | Cria/atualiza delegação |
| `DELETE` | `/api/v1/admin/sponsor-orgs/:orgId/delegations/:wallet` | `admin.sponsors.manage` | Remove delegação |

### 7.2 Sponsor (protegidos por `requirePerm` com escopo do caller)

| Método | Rota | Permission | Descrição |
|--------|------|------------|-----------|
| `GET` | `/api/v1/sponsor/org` | `sponsor.{orgId}.*` (owner) | Retorna org do caller |
| `GET` | `/api/v1/sponsor/delegations` | `sponsor.{orgId}.delegations.manage` | Lista delegações |
| `POST` | `/api/v1/sponsor/delegations` | `sponsor.{orgId}.delegations.manage` | Cria delegação |
| `DELETE` | `/api/v1/sponsor/delegations/:wallet` | `sponsor.{orgId}.delegations.manage` | Remove delegação |

## 8. Fases

| # | Nome | Depende | Subagente | TDD? |
|---|------|---------|-----------|------|
| 1 | Modelos MongoDB + campo permissions + auto-atribuição | — | api-gateway | Sim (teste do permissionMatcher + UserProfile) |
| 2 | Middleware `requirePerm` + pattern matching | Fase 1 | api-gateway | Sim (teste do middleware) |
| 3 | Endpoints admin | Fase 2 | api-gateway | Sim (testes de integração) |
| 4 | Endpoints sponsor self-service | Fase 3 | api-gateway | Sim (testes de integração) |
| 5 | Frontend: permissions no contexto + nav filtrada | Fase 2 | frontend | Sim (testes de renderização) |
| 6 | Frontend: UsersAdmin + SponsorsAdmin | Fase 3+5 | frontend | Sim (testes de componente) |
| 7 | Frontend: sponsor self-service delegations | Fase 4+5 | frontend | Sim (testes de componente) |
| 8 | Finalização: ADR, Sonar, deploy, testes E2E | Todas | platform | Conforme existente |

## 9. Audit Trail

Toda ação sensível é registrada em MongoDB `AuditLog`:

```
AuditLog {
  _id:         ObjectId
  actor:       string    (wallet de quem fez)
  action:      string    (ex: 'role.assign', 'permissions.update', 'delegation.create', 'perm.denied')
  target:      string    (ex: 'wallet:targetuser', 'org:org_abc')
  details:     object    (dados contextuais: oldValue, newValue, reason, requiredPerms)
  ip:          string    (origem da requisição)
  userAgent:   string
  createdAt:   Date
}
Index: { actor: 1, createdAt: -1 }
Index: { action: 1, createdAt: -1 }
Index: { target: 1, createdAt: -1 }
```

### Eventos auditados

| Ação | Onde | Dados |
|------|------|-------|
| `role.assign` | profileController.assignRole | actor, target (wallet), oldRole → newRole |
| `role.autoassign` | profileController.getProfile | actor, target, role (contract_admin) |
| `permissions.update` | permissionController.updateUserPermissions | actor, target, oldPerms → newPerms |
| `permissions.autoassign` | profileController.assignRole | actor, target, role, permissions setadas |
| `org.create` | profileController.assignRole | actor, orgId, owner_wallet |
| `delegation.create` | permissionController / sponsorPermissionController | actor, orgId, delegate, permissions |
| `delegation.remove` | permissionController / sponsorPermissionController | actor, orgId, delegate |
| `perm.denied` | requirePerm middleware | actor, target (wallet), requiredPerms, route |
| `auth.failed` | requireAuth middleware | wallet (se extraído), reason |

## 10. Restrições

- `contract_admin` mantém bypass total (sem permissões explícitas)
- `assignRole` continua limitando: só pode setar `player|moderator|sponsor|admin` (nunca `contract_admin`)
- `SponsorDelegation.permissions` não pode conter `delegations.manage` — prevenção de escalada
- AuditLog é append-only (sem delete/update)
- Não quebrar compatibilidade reversa: `requireRole` continua funcionando sem `requirePerm`
