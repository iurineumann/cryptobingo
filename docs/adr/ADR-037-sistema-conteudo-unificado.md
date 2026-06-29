# ADR-037 — Sistema de Conteúdo Unificado + User Settings

**Status:** Aceito (2026-06-29)
**Data:** 2026-06-29

---

## Problema

CryptoBingo gerencia conteúdo de frontend de três formas distintas:

1. **Estático em locale JSON:** FAQ, (futuros) HowItWorks, Sponsors — dependem de deploy para qualquer alteração de texto
2. **Dinâmico via MongoDB com schema próprio:** NewsFeed (`newsfeed` collection) — controller + rotas + cache dedicados
3. **Misto:** Tutorials planejado como dinâmico mas sem schema definido

Além disso:
- Não há editor/admin UI para conteúdo não-News
- Tradução automática existe só para News (`translation/index.ts`) mas não exposta como serviço reutilizável para outros tipos
- Configurações de usuário (RPC, Explorer) ficam em localStorage solto, sem integração com perfil MongoDB
- Não há permissão granular para publicação de conteúdo — qualquer admin publica qualquer coisa

## Decisão

### 1. Collection Única `content`

Unificar TODO conteúdo editorial em uma única collection MongoDB `content` com campo discriminador `type`.

### 1a. Editor Rico (BlockNote)

Conteúdo editorial (News, Tutorials, HowItWorks, Sponsors) precisa de edição visual fluida como WordPress Gutenberg. Para isso, adotamos **BlockNote** — editor block-based open source (MIT) para React, com experiência Notion-like.

**BlockNote no fluxo:**
- Admin escreve/diagrama conteúdo no BlockNote dentro do ContentAdmin
- BlockNote produz JSON blocks (`PartialBlock[]`) — estrutura tipo:
  ```json
  [{ "type": "heading", "content": "Título" },
   { "type": "paragraph", "content": "Texto com formatação" },
   { "type": "image", "url": "...", "caption": "..." }]
  ```
- JSON blocks armazenado no campo `content` do MongoDB
- Frontend renderiza via `@blocknote/react` (server-safe ou client-only)
- Para FAQ (pergunta+resposta simples), `content` continua string — BlockNote só para tipos que precisam de diagramação

**Schema:**

```
content {
  _id:              ObjectId
  type:             'faq' | 'howitworks' | 'sponsors' | 'tutorials' | 'news'
  slug:             string            // único dentro do type (ex: "como-jogar")
  title:            string
  content_format:   'text' | 'blocks' // 'text' para FAQ, 'blocks' para demais
  content:          string | PartialBlock[]  // string para text, JSON array para blocks
  image_url:        string | null
  metadata:         Record<string, any> | null  // ex: { question: "..." } para FAQ
  pinned:           boolean
  sort_order:       number            // ordenação dentro do type
  locale_overrides: Partial<Record<'en-US' | 'zh-CN', { title: string; content: string | PartialBlock[] }>>
  active:           boolean           // soft delete
  published_at:     string            // ISO 8601
  published_by:     string            // wallet address
}
```

**Tradução de block content:** o pipeline de tradução precisa ser block-aware. Para blocks, extrai todo texto dos nós, traduz, e reconstrói os blocks com texto traduzido (mantendo estrutura/formatação). A função `translateContent()` existente ganha overload para `PartialBlock[]`.

**Índice:** `{ type: 1, active: 1, pinned: -1, sort_order: 1 }`

### 2. API Genérica `/api/v1/content/:type`

Controller único (`contentController.ts`) com operações CRUD parametrizadas por `type`:

| Método | Rota | Auth | Cache |
|---|---|---|---|
| GET | `/api/v1/content/:type` | público | Redis 2min |
| GET | `/api/v1/content/:type/:id` | público | Redis 2min |
| POST | `/api/v1/content/:type` | `requireContentPerm(type, 'create')` | invalida |
| PATCH | `/api/v1/content/:type/:id` | `requireContentPerm(type, 'edit')` | invalida |
| DELETE | `/api/v1/content/:type/:id` | `requireContentPerm(type, 'delete')` | invalida |

### 3. Permissões Granulares de Conteúdo

Extensão do namespace ADR-036:

```
admin.content.*                          → super admin de conteúdo
admin.content.faq.*                      → tudo de FAQ
admin.content.faq.view                   → só visualizar
admin.content.faq.create                 → criar rascunho
admin.content.faq.edit                   → editar (rascunho ou pendente)
admin.content.faq.publish                → publicar (active=true)
admin.content.faq.delete                 → soft delete
admin.content.faq.translate              → revisar/aceitar traduções
```

Mesmo pattern para: `howitworks`, `sponsors`, `tutorials`, `news`.

Middleware `requireContentPerm(type, action)` reusa `requirePerm()` existente (ADR-036) com pattern matching.

### 4. Auto-Translate Pipeline com Revisão

Reusa o serviço `translation/index.ts` (ADR-025) que já suporta 4 providers (LibreTranslate, DeepL, Google, MyMemory) com cache Redis.

**Fluxo:**
1. Admin cria/edita conteúdo (POST/PATCH) → backend chama `translateNewsContent()` automaticamente
2. `locale_overrides` populado com tradução automática
3. Admin vê no ContentAdmin: "EN: tradução automática ✓" / "ZH: tradução automática ✓"
4. Admin pode:
   - **Aceitar:** salva locale_overrides como está
   - **Revisar:** modal com editores lado a lado (original + tradução), edita manualmente, depois "Aceitar"
   - **Regerar:** re-chama translate (sobrescreve)

**Falha:** se translate falha, `locale_overrides` fica vazio, admin traduz manualmente. Nunca bloqueia publicação.

### 5. Migração NewsFeed

- Collection `newsfeed` migrada para `content` com `type: 'news'`
- `GET /api/v1/news` mantido como redirect ou wrapper para `GET /api/v1/content/news` (backward compat)
- `NewsPage.tsx` troca `fetchNews()` por `fetchContentByType('news')`
- `NewsItem` type deprecated, usar `ContentItem`

### 6. User Settings no Perfil

`MongoUserProfile.preferences` estendido:

```
preferences: {
  locale:           SupportedLocale
  currency_display: string
  sound_enabled:    boolean
  rpc_url:          string     // novo
  explorer_url:     string     // novo
}
```

`PUT /api/v1/profile` aceita os novos campos. Frontend persiste via `updateUserPreferences()`.
RPC URL também mantém cache em `localStorage('cb_rpc_url')` para leitura síncrona na inicialização do Wharfkit (que precisa do valor antes de qualquer chamada API).

## Consequências

### Positivas

- Todo conteúdo editorial editável sem deploy
- Admin UI unificada (ContentAdmin.tsx) para todos os tipos
- Editor rico (BlockNote) permite diagramação visual sem necessidade de CMS externo
- Service de tradução reutilizado com adaptação block-aware
- Permissões granulares permitem "editor de FAQ" que só mexe em FAQ
- User Settings centralizado num lugar só (UserSettingsPage)
- RPC + Explorer configuráveis por usuário, persistidos no perfil

### Negativas

- Migração única de `newsfeed` para `content` (scripts/seed-content.ts)
- Complexidade adicional no modelo de permissões (5 novos namespaces)
- ContentAdmin precisa ser genérico o suficiente para acomodar tipos com schemas diferentes (FAQ tem `metadata.question` + content text, News/Tutorials têm content blocks)
- RPC change continua exigindo `window.location.reload()` (limitação do Wharfkit)
- Dependência externa: `@blocknote/react` adicionada ao bundle do frontend
- Pipeline de tradução precisa de lógica extra para extrair/traduzir/reconstruir blocks

### Neutras

- `GET /api/v1/news` coexistirá com `GET /api/v1/content/news` durante transição
- FAQ estático em locale JSON removido após seed — conteúdo passa a vir todo do MongoDB
- `translateNewsContent` renomeado para `translateContent` (refatoração cosmética)
- FAQ usa `content_format: 'text'` (string simples); News/Tutorials/HowItWorks/Sponsors usam `content_format: 'blocks'` (JSON BlockNote)

## Alternativas Consideradas

1. **Collections separadas por tipo:** Rejeitado — maior boilerplate de controllers, rotas, cache e permissões. Collection única com `type` é mais simples e o schema é idêntico entre tipos.
2. **Conteúdo 100% estático (status quo):** Rejeitado — deploy para cada tweak de texto é inaceitável para operação contínua.
3. **CMS externo (Strapi, Sanity, WordPress headless):** Rejeitado — overkill para o porte. API própria é mais leve, integrada com auth existente e sem dependência externa. CMS externo adiciona latência de rede, outro banco, outra esteira de deploy, e complexidade de manutenção.
4. **Permissões de conteúdo como `admin.content.manage` único:** Rejeitado — não permite granularidade de "pode editar FAQ mas não publicar". O namespace `admin.content.<type>.<action>` é consistente com ADR-036.

### Editores considerados

| Editor | Tipo | Prós | Contras |
|---|---|---|---|
| **BlockNote** | Block-based (Notion-like) | React nativo, MIT, dark theme, block-aware, intuição WordPress | Mais novo, ecossistema menor |
| **TipTap** | Headless (ProseMirror) | Maduro, flexível, React bindings | Precisa montar UI do zero, mais setup |
| **Lexical** (Meta) | Framework editor | Performance, Meta-backed | Documentação esparsa, React aging |
| **Slate.js** | Framework editor | Flexível, usado em produção | API complexa, boilerplate alto |
| **textarea + Markdown** | Simples | Zero dependência | Pobre para não-devs, sem diagramação |

**Decisão:** BlockNote. O block-based é o mais próximo da experiência WordPress/Gutenberg que o usuário deseja. Custom blocks futuros (FAQ question/answer, embed, NFT card) são viáveis com a API de blocos customizados do BlockNote.

## Referências

- ADR-024: Rankings e Conteúdo (conteúdo estático original)
- ADR-025: Tradução Híbrida (auto-translate)
- ADR-036: RBAC+Perms (permissões granulares)
- Plano: `.opencode/plans/2026-06-29-fase8-game-room-content-system.md`
