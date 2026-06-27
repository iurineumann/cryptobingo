# ADR-036 — RBAC+Perms: Permissões Granulares + Delegação Sponsor

**Status:** Proposto
**Data:** 2026-06-27

---

## Problema

RBAC atual (5 papéis rígidos: `player`, `moderator`, `sponsor`, `admin`, `contract_admin`) não permite:

1. Admin com escopo limitado (ex: "admin que só gerencia NFTs, não vê configuração")
2. Sponsor master delegar permissões para sub-contas (ex: "wallet X gerencia drops da sala Y")
3. UI adaptativa que só mostra o que o usuário pode acessar
4. Audit granular de ações sensíveis

## Decisão

Adotar modelo **RBAC+Perms** em duas camadas:

- **Role** (coarse gate): `requireRole('admin')` — mantido como porta de entrada para seções
- **Permissions** (fine gate): `requirePerm('admin.users.manage')` — controle de ação específica

### Data Model

- `UserProfile` ganha campo `permissions: string[]` (off-chain, MongoDB)
- `SponsorOrg` (novo): `{ orgId, owner_wallet, name, settings }` — auto-criado ao promover sponsor
- `SponsorDelegation` (novo): `{ orgId, wallet_address, permissions[], delegated_by, active }` — delegação para sub-contas

### Namespace de Permissões

```
admin.*                                 → super admin
  admin.dashboard.view                  → KPIs
  admin.rooms.manage                    → CRUD salas
  admin.users.view | .manage            → visualizar / editar usuários
  admin.sponsors.view | .manage         → visualizar / editar sponsors
  admin.tokens.manage                   → tokens
  admin.nfts.manage                     → NFTs
  admin.campaigns.manage                → campanhas
  admin.vault.manage                    → vault
  admin.patterns.manage                 → padrões
  admin.gametypes.manage                → gametypes
  admin.compliance.view                 → compliance
  admin.news.manage                     → notícias
  admin.config.manage                   → sistema

sponsor.{orgId}.*                       → tudo do org (master)
  sponsor.{orgId}.dashboard.view        → visão geral
  sponsor.{orgId}.rooms.manage          → todas as salas
  sponsor.{orgId}.rooms.{roomId}.manage → sala específica
  sponsor.{orgId}.treasury.view         → ver saldo
  sponsor.{orgId}.treasury.withdraw     → sacar
  sponsor.{orgId}.drops.manage          → drops
  sponsor.{orgId}.delegations.manage    → delegar (apenas master)
```

### Permission Matcher

Pattern matching estilo glob por dot-segments: `.*` casa qualquer sub-nível.

```
admin.*           → admin.users.manage ✓  |  admin.rooms.manage ✓
sponsor.org_abc.* → sponsor.org_abc.rooms.manage ✓
sponsor.*.treasury.view → sponsor.org_abc.treasury.view ✓  |  sponsor.org_xyz.treasury.view ✓
```

### Automação

- Admin promovido → `permissions = ['admin.*']`
- Sponsor promovido → cria `SponsorOrg` + `permissions = ['sponsor.{orgId}.*']`
- `contract_admin` bypassa tudo (permissions = [])
- GET /profile retorna permissions[]

### Segurança

- `SponsorDelegation` não pode ter `delegations.manage` (prevenção de escalada de privilégio)
- `assignRole` continua limitado a `player|moderator|sponsor|admin`
- Role de `contract_admin` só auto-atribuída para `CONTRACT_ACCOUNT`

## Consequências

### Positivas

- Admin com escopo: possível ter "admin de NFTs", "admin de usuários", etc.
- Sponsor escalável: master delega para gerentes de sala, financeiro, etc.
- UI inteligente: nav só mostra seções com permissão
- Compatível com Casbin futuro se o modelo crescer
- TDD em cada fase garante cobertura

### Negativas

- Complexidade adicional de modelo (2 coleções novas)
- Frontend precisa receber e propagar permissions[] no contexto
- Migração de perfis existentes: admins e sponsors atuais ganham `['admin.*']` ou `['sponsor.{orgId}.*']` no primeiro login pós-deploy

### Neutras

- `requireRole` coexiste com `requirePerm` — rotas antigas sem `requirePerm` continuam funcionando
- Sponsor sem orgId ainda existe? Não — todo sponsor precisa de org (criado automaticamente)

### Audit Trail

Modelo `AuditLog` no MongoDB registra toda ação sensível:
- `role.assign` / `role.autoassign` — mudanças de papel
- `permissions.update` / `permissions.autoassign` — mudanças de permissão
- `org.create` — criação de organização sponsor
- `delegation.create` / `delegation.remove` — delegações
- `perm.denied` — tentativas de acesso negado (403)
- `auth.failed` — falhas de autenticação

Cada entrada: `{ actor, action, target, details (oldValue, newValue, reason), ip, userAgent }`. Append-only, sem delete.

## Alternativas Consideradas

1. **Casbin/PBAC puro:** Overkill para o porte atual. Curva de aprendizado + dependência externa para 2-3 cenários. O modelo de string[] + pattern match cobre os casos sem Casbin.
2. **RBAC com sub-roles:** Ex: `admin:users`, `admin:finance`. Mais simples que permissions mas não escala para delegação sponsor com escopo por sala.
3. **Permissões no JWT:** Rejeitado — impossibilita revogação imediata sem re-emitir token. Busca MongoDB a cada request (mesmo padrão do RBAC atual).

## Referências

- Spec: `docs/superpowers/specs/2026-06-27-permission-system.md`
- Planos: `docs/superpowers/plans/2026-06-27-permission-system-fase*.md`
- ADR-026: Modelo de permissões EOSIO (on-chain)
- ADR-009: Admin Panel
