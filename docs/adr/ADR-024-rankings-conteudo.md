# ADR-024 — Rankings & Conteúdo (Leaderboard, FAQ, News)

**Status:** Aceito  
**Data:** 2026-06-11  
**Issue:** [#28](https://github.com/iurineumann/cryptobingo/issues/28)  
**Autores:** Iuri Neumann, Claude Sonnet 4.6

---

## Contexto

O CryptoBingo necessita de páginas públicas para engajamento e retenção de jogadores:
- **Leaderboard:** ranking de vencedores estimula competição e credibilidade da plataforma;
- **FAQ:** responde dúvidas frequentes sem depender de suporte, reduz fricção de novos jogadores;
- **News/Promoções:** canal próprio para o admin divulgar campanhas sem depender de redes sociais.

Nenhuma dessas funcionalidades altera o contrato C++ nem a economia on-chain. São pure-frontend + api-gateway usando dados já existentes.

---

## Decisão

### 1. Leaderboard

**Fonte de dados:** PostgreSQL `transactions_ledger` — agregação de transações `action_type = 'claim_win'` agrupadas por `user_id` (join com `users.wallet_address` e perfil Mongo para nickname).

**Justificativa:** Não recalcular on-chain (leitura seria cara e lenta na WAX pública); o ledger já é a fonte de verdade financeira auditável (Lei 14.790/2023, ADR-005).

**Endpoints:**
- `GET /api/v1/leaderboard` — top 50 global, sem autenticação, cache Redis 5 min
- `GET /api/v1/leaderboard/rooms/:room_id` — top 20 por sala, sem autenticação, cache Redis 5 min

**Cache:** Redis key `leaderboard:global` / `leaderboard:room:{room_id}`, TTL 5 min. Invalidação automática por TTL (não por evento — latência tolerável).

**Filtragem:** parâmetros opcionais `?currency=WAX&limit=N` (max 50 global, max 20 por sala).

### 2. FAQ

**Abordagem:** Página estática no frontend — sem endpoint de API. Conteúdo em `src/locales/` (pt-BR, en-US, zh-CN) como array de `{ question, answer }` por locale. Rota pública `/faq`.

**Justificativa:** FAQ não muda com frequência; i18n já é o mecanismo de tradução existente; zero infra adicional, zero custo de manutenção de banco.

### 3. News / Promoções

**Fonte de dados:** MongoDB — nova coleção `news_feed`. Admin publica via API autenticada (JWT + role `admin`). Visitantes leem sem autenticação.

**Endpoints:**
- `GET /api/v1/news` — lista publicações ativas, ordenadas por `published_at` desc, cache Redis 2 min
- `POST /api/v1/news` — admin cria publicação (JWT admin)
- `PATCH /api/v1/news/:id` — admin edita (JWT admin)
- `DELETE /api/v1/news/:id` — admin remove/arquiva (JWT admin, soft delete via `active: false`)

**Schema MongoDB (`news_feed`):**
```
{
  _id: ObjectId,
  title: string,                     // fallback (pt-BR)
  content: string,                   // markdown ou HTML sanitizado
  image_url?: string,
  locale_overrides?: {               // traduções opcionais
    'en-US'?: { title, content },
    'zh-CN'?: { title, content }
  },
  active: boolean,                   // soft delete
  pinned: boolean,                   // aparece no topo
  published_at: Date,
  published_by: string               // wallet do admin
}
```

---

## Alternativas consideradas

| Alternativa | Decisão |
|---|---|
| Leaderboard on-chain via `get_table_rows` | Rejeitado — latência alta, sem histórico de ganhos por wallet |
| FAQ em banco (CMS leve) | Rejeitado — overhead sem ganho; atualização via PR é aceitável |
| News em PostgreSQL | Rejeitado — MongoDB já cobre edge dinâmico; PG é para compliance/ledger |
| Cache via CDN (Cloudflare) | Pós-épica — Redis cobre o MVP; CDN é camada de otimização |

---

## Consequências

### Positivo
- Leaderboard usa ledger já auditado — sem drift entre "o que foi pago" e "o que aparece"
- FAQ sem infra adicional — zero manutenção
- News isolada no Mongo edge — admin opera sem deploy

### Negativo / Mitigações
- Leaderboard com latência de 5 min (cache) — aceitável para ranking; podemos reduzir TTL se necessário
- FAQ requer PR para atualizar conteúdo — aceitável no MVP; CMS pode ser adicionado depois
- News sem moderação de conteúdo — apenas admins publicam (RBAC); sem UGC nessa rota

---

## Especificação técnica

### Tipos novos em `packages/shared-types/`

```typescript
export interface LeaderboardEntry {
  rank:       number;
  wallet:     string;
  nickname:   string | null;
  total_won:  number;   // soma dos claim_win em unidades mínimas
  currency:   string;   // 'WAX', 'BINGO', etc.
  games_won:  number;   // qtd de transações claim_win
  room_id?:   string;   // presente apenas no leaderboard por sala
}

export interface NewsItem {
  id:               string;
  title:            string;
  content:          string;
  image_url:        string | null;
  locale_overrides: Partial<Record<'en-US' | 'zh-CN', { title: string; content: string }>>;
  active:           boolean;
  pinned:           boolean;
  published_at:     string;  // ISO 8601
  published_by:     string;
}
```

### Rotas frontend (ADR-015)
- `/leaderboard` — público, sem login
- `/faq` — público, sem login
- `/news` — público, sem login
- `/admin/news` — admin, JWT obrigatório (RBAC)

### Rate limiting
- `GET /leaderboard*` e `GET /news` — 100 req/min por IP (existingMiddleware rate-limit)
- `POST|PATCH|DELETE /news` — auth obrigatória, sem rate limit extra (RBAC suficiente)

---

## Referências

- ADR-005: Fixed Odds Treasury (ledger PG como fonte financeira)
- ADR-009: Admin RBAC
- ADR-010: Rooms / Salas
- ADR-015: Router v6 + rotas frontend
- [Issue #28](https://github.com/iurineumann/cryptobingo/issues/28)
