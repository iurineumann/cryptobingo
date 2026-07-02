# Sponsor Org: Criação via Admin

## Motivação

Sponsor orgs eram criadas apenas no auto-registro (`assignRole` com `role === 'sponsor'` em
`profileController.ts`). Admin não tinha meio de criar uma org para um usuário sem reatribuir
role — fluxo quebrado pós-reset de ambiente.

## API

### `POST /api/v1/admin/sponsor-orgs`

**Auth:** `admin.sponsors.manage`

**Body:**
```json
{ "owner_wallet": "string (req)", "name": "string (opcional)" }
```

**Validação:**
- `owner_wallet` obrigatório (400)
- `UserProfile.findOne({ wallet_address })` — 404 se não existir
- `SponsorOrg.findOne({ owner_wallet })` — 409 se duplicata

**Criação:**
1. `generateOrgId()` — 8 chars aleatórios + prefixo `org_`
2. `SponsorOrg.create({ orgId, owner_wallet, name, settings })`
3. `UserProfile.updateOne({ wallet_address }, { $addToSet: { permissions: `sponsor.${orgId}.*` } })` — não-bloqueante
4. `logAudit({ action: 'org.create', ... })`

**Response 201:**
```json
{ "orgId": "org_abc123", "owner_wallet": "...", "name": "...", "permissionsAutoAssigned": true }
```

**Erros:** 400 (wallet vazio), 404 (perfil), 409 (duplicata), 500 (genérico)

## Frontend

### CreateOrgModal (inline em SponsorsAdmin.tsx)

- **Disparo:** Botão "Nova Organização" no topo da lista, visível com `admin.sponsors.manage`
- **Combobox wallet:** Fetch `GET /api/v1/admin/users?limit=100` no mount, filtro local por `wallet_address`/`username`, dropdown navegável
- **Campo nome:** Texto opcional
- **Submit:** `POST /api/v1/admin/sponsor-orgs` → refresh lista
- **Erros:** 404/409 exibidos inline no modal

### Testes

- 3 testes unitários API (success/404/409)
- 5 testes frontend (botão visível/oculto, submit success, erro 404, erro 409)

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `permissionController.ts` | + `createSponsorOrg` + `generateOrgId` + import `logAudit` |
| `permissionController.test.ts` | +3 testes |
| `index.ts` (api-gateway) | + rota + import |
| `SponsorsAdmin.tsx` | + `CreateOrgModal` + botão |
| `SponsorsAdmin.test.tsx` | +5 testes |

## Segurança

- `admin.sponsors.manage` requerido (gate no middleware)
- Auto-assign de permissão não-bloqueante (não impede criação)
- `delegations.manage` excluído de delegações (prevenção de escalada)
