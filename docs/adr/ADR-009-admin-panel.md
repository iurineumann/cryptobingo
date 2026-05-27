# ADR-009: Admin Panel — Arquitetura de Interface Administrativa

**Data:** 2026-05-26
**Status:** Aceito
**Autores:** Célula de Engenharia CryptoBingo

---

## Contexto

O CryptoBingo acumula três camadas de dados que exigem visibilidade e gestão administrativa:

1. **On-chain** — jogos, padrões (bitmasks), gametypes, campanhas de patrocínio, saldos de jogadores
2. **PostgreSQL (Ledger)** — histórico de jogos, transações, relatórios RTP (Lei 14.790/2023)
3. **MongoDB (Edge)** — perfis de usuário, gamificação (XP/tier), preferências

Até então, toda administração dependia de chamadas diretas ao `cleos` ou queries SQL,
inviabilizando o uso por operadores não-técnicos. A demanda é por uma interface
web unificada que cubra operação do jogo (padrões/gametypes), compliance (RTP/ledger)
e B2B (campanhas de patrocínio).

---

## Decisão

### 1. State-based Routing (sem React Router)

O frontend React usa um estado `section: 'lobby' | AdminSection` em `App.tsx`
para alternar entre lobby do jogador e painel admin. **Justificativa:** o aplicativo
tem exatamente dois modos (jogador e admin), sem necessidade de deep linking,
nested routes ou lazy loading de seções. State-based é mais simples, elimina
a dependência de `react-router-dom`, e mantém consistência com o padrão existente.

### 2. AdminLayout como Shell

Um componente `AdminLayout` provê:
- Sidebar fixa à esquerda (224px) com 7 itens de navegação
- Área de conteúdo principal à direita
- Botão "Voltar ao Lobby" no rodapé da sidebar
- A navegação é feita via callback `onNavigate(section)`, sem roteamento interno

### 3. Separação de Fontes de Dados

Cada seção admin busca dados da fonte mais apropriada:

| Seção | Fonte Primária | Mecanismo |
|---|---|---|
| Dashboard | On-chain + PostgreSQL | `get_table_rows` + `GET /statistics/*` |
| Patterns | On-chain (via gateway) | `GET/POST/DELETE /admin/patterns` |
| Gametypes | On-chain (via gateway) | `GET/POST/DELETE /admin/gametypes` |
| Sponsors | On-chain (via gateway) | `GET /sponsors/campaigns` |
| Compliance | PostgreSQL (via gateway) | `GET /statistics/rtp`, `GET /statistics/games` |
| Users | MongoDB (via gateway) | `GET /admin/users` (read-only MVP) |
| Player Dashboard | On-chain | `get_table_rows` (balances, tickets, games) |

### 4. Role Gating

O botão "Admin" na navbar só aparece se `profile.role === 'admin'`. O campo
`role` foi adicionado como opcional ao `MongoUserProfile` em shared-types.
A autorização real é validada server-side pelo middleware RBAC (`rbac.ts`).

### 5. API Service Layer

Todas as chamadas HTTP para o api-gateway foram centralizadas em
`services/api.ts` com tipos exportados, seguindo o padrão existente.
Foram adicionadas 12 novas funções tipadas para os endpoints admin.

### 6. Multi-Role Dev Login

O ambiente de desenvolvimento agora oferece 5 perfis de login via private key:
Jogador 1, Jogador 2, Game Admin, Contract Admin, Sponsor. Cada perfil tem
sua própria conta WAX no nó DUNE, com chave gerada dinamicamente pelo
`init_dev_env.sh` e propagada para `apps/frontend/.env`.

---

## Consequências

**Positivas:**
- Setup administrativo completo sem novas dependências (sem React Router)
- Consistência com o padrão state-based existente
- Separação clara entre fontes on-chain e off-chain
- Role-gating funcional mesmo sem o endpoint /admin/users implementado
- Ambiente dev reproduzível com múltiplos perfis

**Negativas:**
- Sem deep linking para seções admin específicas (URL sempre /)
- Sidebar não é colapsável em mobile (viewport < 768px pode ficar apertada)
- `any[]` casts necessários em PlayerDashboard devido à divergência entre
  shared-types .d.ts compilados e os tipos do Wharfkit

---

## Arquivos Alterados

- `apps/frontend/src/App.tsx` — state-based admin routing, multi-role dev login
- `apps/frontend/src/components/admin/AdminLayout.tsx` — sidebar + content shell
- `apps/frontend/src/components/admin/AdminDashboard.tsx` — KPIs on-chain
- `apps/frontend/src/components/admin/PatternsAdmin.tsx` — CRUD de bitmasks
- `apps/frontend/src/components/admin/GametypesAdmin.tsx` — CRUD de gametypes
- `apps/frontend/src/components/admin/SponsorDashboard.tsx` — campanhas B2B
- `apps/frontend/src/components/admin/ComplianceAdmin.tsx` — RTP + histórico
- `apps/frontend/src/components/admin/UsersAdmin.tsx` — listagem de usuários
- `apps/frontend/src/components/admin/PlayerDashboard.tsx` — dados do jogador
- `apps/frontend/src/services/api.ts` — 12 funções admin tipadas
- `packages/shared-types/src/index.ts` — role opcional em MongoUserProfile
- `init_dev_env.sh` — 3 novas contas + propagação de .env
