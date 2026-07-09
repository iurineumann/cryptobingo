# Landing Page: Content UX & Search Evolution

**Data:** 2026-07-04
**Status:** Draft
**Equipes:** UX/UI Designer, Content Strategist, Search Engineer, Nav Architect, Psicólogo Cognitivo, Designer Instrucional, Curador de Mídia, UX Writer, SEO Specialist, Community Manager, Legal/Compliance, Editor, Domain Expert, Visual Designer

---

## 1. Resumo Executivo

Evolucao da landing page em 6 tracks paralelas para melhorar engajamento, legibilidade, navegacao e descoberta de conteudo. Baseado em auditoria de 9 componentes, 15+ paginas, 53 arquivos de conteudo.

| Track                    | Time                            | Esforco |
| ------------------------ | ------------------------------- | ------- |
| 0 — Bug Fixes            | Eng                             | ~1h     |
| 1 — Blog/Tutorials UX/UI | UX/UI Designer                  | ~16h    |
| 2 — Content Strategy | Content Strategist + Copywriter | ~30h |
| 3 — Legal Page TOC       | UX/UI + Eng                     | ~4h     |
| 4 — Navigation           | Nav Architect                   | ~10h    |
| 5 — Search System        | Search Engineer                 | ~10h    |

---

## 2. Track 0 — Bug Fixes

### 2.1 Ideias Header Link

**Problema:** `Header.tsx` linha 76: `href: '/ideas'` sem locale prefix.

**Solucao:** `href: \`/\${currentLocale}/ideas\``

**Arquivo:** `apps/landing-page/src/components/Header.tsx`

### 2.2 Blog Typography

**Problema:** `@tailwindcss/typography` nao instalado. Classes `prose prose-invert` ignoradas. HTML do blog sem estilo.

**Solucao:** `pnpm add @tailwindcss/typography -D` + `@plugin "@tailwindcss/typography"` no `globals.css`.

---

## 3. Track 1 — Blog & Tutorials UX/UI

### 3.1 Typography System

**Abordagem:** `@tailwindcss/typography` com customizacoes para tema escuro.

```css
/* globals.css */
@plugin "@tailwindcss/typography";

.prose-invert {
  --tw-prose-body: var(--color-gray-300);
  --tw-prose-headings: var(--color-white);
  --tw-prose-links: var(--color-brand-400);
  --tw-prose-bold: var(--color-white);
  --tw-prose-counters: var(--color-gray-400);
  --tw-prose-bullets: var(--color-gray-400);
  --tw-prose-hr: var(--color-gray-700);
  --tw-prose-quotes: var(--color-gray-300);
  --tw-prose-quote-borders: var(--color-brand-500);
  --tw-prose-code: var(--color-brand-300);
  --tw-prose-pre-code: var(--color-gray-200);
  --tw-prose-pre-bg: var(--color-surface-900);
  --tw-prose-th-borders: var(--color-gray-600);
  --tw-prose-td-borders: var(--color-gray-700);
}
```

**Typographic scale:** Geist font, `prose-lg` em desktop, `prose` em mobile. `max-w-3xl` para coluna de leitura (65-75 caracteres/linha).

### 3.2 Blog Post Layout (`BlogPost.tsx`)

```
┌─────────────────────────────────────────┐
│  [Breadcrumbs: Home > Blog > Post]      │
│                                         │
│  ┌─────── Cover Image (16:9) ───────┐  │
│  │                                   │  │
│  └───────────────────────────────────┘  │
│                                         │
│  # Post Title (h1)                      │
│                                         │
│  Author · Date · 5 min read            │
│                                         │
│  [tag1] [tag2] [tag3]                  │
│                                         │
│  ──── prose prose-invert max-w-none ────│
│  Body content (marked HTML)             │
│  with h2, h3, p, ul, ol, blockquote... │
│  ───────────────────────────────────────│
│                                         │
│  ── Related Posts (3 cards) ──          │
│  ── ← Previous · Next → ──             │
│  ── [Back to Blog] ──                  │
└─────────────────────────────────────────┘
```

**Novos elementos:**

- Cover image: `<img>` com `post.cover` (fallback `/og-image.png`)
- Metadata bar: author + date + reading time (computed from body word count)
- Tags: pills estilizadas, link para filtro no BlogIndex
- Reading progress bar: thin line no topo da pagina (`useReadingProgress` hook)

### 3.3 Tutorial Layout (`TutorialPost.tsx`)

Similar ao blog mas com:

- Step indicator: `Passo 1 de 5` com barra de progresso
- Sequential nav: `← Anterior` / `Proximo →` baseado em `order` do frontmatter
- Destaque visual para comandos/code blocks

### 3.4 Content Body Components

Extrair de `PageView.tsx` e `BlogPost.tsx`:

| Componente       | Uso                                     |
| ---------------- | --------------------------------------- |
| `ContentHeader`  | Cover + title + metadata + tags         |
| `ContentBody`    | Wrapper `prose prose-invert max-w-none` |
| `RelatedContent` | Cards de posts/tutoriais relacionados   |
| `PrevNextNav`    | Navegacao sequencial                    |

### 3.5 Index Pages (`BlogIndex.tsx`, `TutorialsIndex.tsx`)

**Cards melhorados:**

- Cover thumbnail (se disponivel)
- Title, description (truncated a 2 linhas)
- Tags chips
- Data + author
- Hover state sutil

**Desktop:** `grid-cols-3` gap-6
**Tablet:** `grid-cols-2`
**Mobile:** `grid-cols-1`

---

## 4. Track 2 — Content Strategy

### 4.1 Biblioteca de Conteudo

**Blog (14 artigos, priorizados — inclui 6 novos para leigos):**

| # | Titulo | Tags | Prioridade |
|---|--------|------|-----------|
| 1 | O Que e Blockchain? Guia para Iniciantes | blockchain, guide, beginner | P0 |
| 2 | Carteiras Crypto: Escolhendo a Sua Primeira | wallet, guide, beginner | P0 |
| 3 | WAX Blockchain para Iniciantes | wax, blockchain, guide | P0 |
| 4 | CryptoBingo e Seguro? Respondendo Suas Duvidas | security, trust, faq | P0 |
| 5 | Provably Fair: Como Verificamos Cada Sorteio | rng, security, provably-fair | P0 |
| 6 | Entendendo os Modos de Jogo (Draw Modes) | gameplay, patterns, guide | P0 |
| 7 | Seguranca para Iniciantes: Protegendo Seus Ativos | security, guide, beginner | P1 |
| 8 | Como Funciona um Smart Contract? (Explicacao Simples) | blockchain, guide, beginner | P1 |
| 9 | RTP 85%: Como Funciona a Economia do Jogo | economy, rtp, tokenomics | P1 |
| 10 | Estrategias de Padroes no Bingo 5x5 | patterns, strategy, gameplay | P1 |
| 11 | NFTs na WAX: O Que Sao e Como Usar | wax, nft, guide | P1 |
| 12 | Tokenomics: BINGO Token e Seu Valor | tokenomics, economy | P2 |
| 13 | O Futuro do Gaming On-Chain | blockchain, gamefi, opinion | P2 |
| 14 | Roadmap: O Que Vem Por Ai | community, update | P2 |

**Tags adicionadas:** `beginner`, `wallet`, `trust`, `nft`, `faq` (18 tags total)

**Tutoriais (9 — inclui 4 novos para iniciantes):**

| # | Titulo | Prioridade |
|---|--------|-----------|
| 1 | Criar Carteira WAX (ja existe, revisar) | P0 |
| 2 | Como Configurar Sua Primeira Carteira WAX | P0 |
| 3 | Comprar WAX em Exchanges | P0 |
| 4 | Comprar Tickets no CryptoBingo | P0 |
| 5 | Entendendo Recursos na WAX (CPU, NET, RAM) | P1 |
| 6 | Como Depositar e Sacar no CryptoBingo | P1 |
| 7 | Receber e Verificar Premios | P1 |
| 8 | Verificar um Sorteio no Block Explorer | P1 |
| 9 | Guia de Staking e Governance | P2 |

**FAQ:** Migrar 2 itens faltantes do root `content/` (provably-fair, wallets).

### 4.2 Taxonomia

**Tags (18):** `wax`, `blockchain`, `gamefi`, `rng`, `security`, `economy`, `tokenomics`, `patterns`, `strategy`, `guide`, `tutorial`, `community`, `provably-fair`, `beginner`, `wallet`, `trust`, `nft`, `faq`

**Categorias (5):** `technology`, `gameplay`, `economy`, `community`, `beginner`

**Frontmatter enriquecido:**

```yaml
---
title: Provably Fair no CryptoBingo
description: Entenda como cada sorteio e criptograficamente verificado
date: 2026-07-04T10:00:00Z
author: CryptoBingo Team
cover: /blog/provably-fair/cover.png
tags: [rng, security, provably-fair, blockchain]
category: technology
reading_time: 8
related:
  - rng-explicado
related_tutorials:
  - verificar-sorteio
---
```

### 4.3 Artigos Relacionados

**Algoritmo:** Build-time. `lib/content.ts` estendido com `computeRelatedPosts()`:

1. Match por tags (interseccao de tags entre posts)
2. Score = (tags em comum / max tags) * peso_tag + (mesma categoria ? 0.3 : 0)
3. Top 3 por score
4. `related: []` no frontmatter sobrescreve (manual override)
5. Cross-type: `related_posts: []` para blog, `related_tutorials: []` para tutorial

### 4.4 Voz e Tom

- **Persona:** Educador confiante. Ponte entre audiencia crypto e bingo.
- **Regra 70/30:** 70% substancia educacional, 30% especifico da plataforma
- **Headlines:** How-to numerico, Pergunta+Resposta, Comparativo, Bastidores
- **CTAs:** Sanduiche — soft no inicio, medio no meio, forte no footer
- **Format:** PT-BR original para posts de comunidade, EN para tech. Sempre traduzir.

### 4.5 Calendario Editorial

- **Frequencia:** Semanal (1 post blog + 1 tutorial a cada 2 semanas)
- **Meta:** 14 posts blog + 9 tutoriais em 20 semanas
- **Fase 1 (semanas 1-6) — Conteudo para leigos (P0):**
  - Sem 1-2: "O Que e Blockchain?" + tutorial Configurar Carteira WAX
  - Sem 3-4: "Carteiras Crypto" + "CryptoBingo e Seguro?"
  - Sem 5-6: "WAX Blockchain" + tutorial Comprar WAX
- **Fase 2 (semanas 7-12) — Conteudo tecnico/didatico (P0):**
  - Sem 7-8: "Provably Fair" + tutorial Comprar Tickets
  - Sem 9-10: "Draw Modes" + "Seguranca para Iniciantes"
  - Sem 11-12: "Smart Contracts" + tutorial Recursos WAX
- **Fase 3 (semanas 13-20) — Aprofundamento (P1/P2):**
  - Sem 13-14: "RTP 85%" + "NFTs na WAX"
  - Sem 15-16: "Estrategias de Padroes"
  - Sem 17-18: "Tokenomics" + tutorial Depositar/Sacar
  - Sem 19-20: "Futuro On-Chain" + "Roadmap" + tutoriais restantes

### 4.6 Fluxo i18n

1. Escrever EN (source of truth para tech) ou PT (para comunidade)
2. Traduzir para os outros 2 locales em ate 48h
3. Revisao: verificar links internos apontam para locale correto
4. Publicar todos os 3 no mesmo dia

### 4.7 Content Quality Standards

#### 4.7.1 Imagens no Conteudo

Cada post/tutorial pode conter quantas imagens forem necessarias para o conteudo. Sem limite fixo — decisao editorial por artigo.

**Fontes de imagem:**

| Fonte | Uso | Licenca |
|-------|-----|---------|
| Unsplash/Pexels | Fotos conceituais (blockchain, seguranca, gaming) | CC0 / gratuita |
| Mermaid.js | Diagramas de fluxo (commit-reveal, compra ticket, pipeline premios) | Codigo aberto |
| Screenshots da plataforma | Tutoriais passo-a-passo, UI real | Proprietario (CryptoBingo) |
| AI-generated (DALL-E/Midjourney) | Ilustracoes customizadas | Verificar licenca por caso |

**Frontmatter `images: []`:**

```yaml
images:
  - src: /images/blog/provably-fair/commit-reveal.png
    alt: "Diagrama das 3 fases do protocolo commit-reveal"
    caption: "Server seed commit → Draw → Reveal. Qualquer um verifica."
  - src: /images/blog/provably-fair/hmac-flow.png
    alt: "Fluxo HMAC-SHA256 combinando seeds"
    caption: "HMAC-SHA256 combina server seed + client seed + nonce"
```

Campos: `src` (obrigatorio), `alt` (obrigatorio, acessibilidade), `caption` (opcional, legenda).

**Componente `<Figure>`:** Renderiza como `<figure>` com `<img>` + `<figcaption>` + lazy loading + suporte a zoom. Fallback para markdown `![alt](src)` quando componente nao disponivel. Ver `apps/landing-page/src/components/Figure.tsx`.

#### 4.7.2 Componentes de Conteudo

| Componente | Proposito | Props |
|------------|-----------|-------|
| `<Figure>` | Imagem com legenda, lazy loading, zoom | `src, alt, caption?` |
| `<Callout>` | Dica, aviso, informacao complementar | `type: tip|warning|info, children` |
| `<GlossaryInline>` | Termo com tooltip definicao | `term, definition` |
| `<Checklist>` | Lista de verificacao (tutorial) | `items: string[], completed?: number` |

**`<Callout>` variants:**

```
<Callout type="tip">
  WAX Cloud Wallet não precisa de seed phrase — apenas email e senha.
</Callout>

<Callout type="warning">
  Nunca compartilhe sua seed phrase. Nós nunca pediremos ela.
</Callout>

<Callout type="info">
  O RTP de 85% é uma média estatística de longo prazo, não uma garantia por sessão.
</Callout>
```

#### 4.7.3 Templates Flexiveis

Templates MDX servem como ponto de partida, nao como regra. Cada equipe de conteudo tem liberdade para expandir, reduzir ou criar novos templates baseados na analise do conteudo e suas particularidades.

**Estrutura base sugerida:**

```mdx
---
title: ""
description: ""
date: ""
author: ""
tags: []
category: ""
cover: ""
reading_time: N
images: []
related: []
related_tutorials: []
---

## Introducao

<Callout type="info">Contexto ou pré-requisito relevante</Callout>

## Secao 1

![Descricao da imagem](/path/to/image.png)
*Legenda explicativa*

Conteudo...

## Secao 2

<Callout type="tip">Dica prática para o leitor</Callout>

Conteudo...

## Resumo

CTA final suave.
```

#### 4.7.4 Fluxo de Personas

**Core Team (sempre ativos na criacao):**

| Persona | Responsabilidade |
|---------|------------------|
| Content Strategist | Define topico, publico-alvo, objetivos, estrutura macro |
| Copywriter | Redige o conteudo |
| Editor | Revisa clareza, tom, consistencia, i18n |
| Domain Expert | Valida precisao tecnica (WAX, RNG, RTP, smart contracts) |

**Especialistas (convocados sob demanda quando um gap e identificado):**

| Persona | Gatilho de ativacao |
|---------|---------------------|
| Psicologo Cognitivo | Carga cognitiva alta, tutorial complexo, retencao baixa |
| Designer Instrucional | Sequencia didatica, diagramas, estrutura de tutorial |
| Visual Designer | Imagens, diagramas, consistencia visual |
| Curador de Midia | Licencas, atribuicao, fontes de imagem |
| UX Writer | Tom, CTA, microcopy, consistencia de voz |
| SEO Specialist | Metadados, internal linking, keywords |
| Community Manager | Adequacao ao publico, tom para cada segmento |
| Localization QA | Qualidade traducao, nuances culturais |
| Legal/Compliance | Disclaimers, regulamentacao jogo (LGPD), RTP nao-garantia |

**Personas de publico-alvo (avaliadoras):** Alem das produtoras, o conteudo tambem e avaliado por 1-2 personas que representam o leitor final do topico. Elas avaliam **eficacia**, nao correcao.

| Persona | Duvida principal | Ativar em |
|---------|------------------|-----------|
| Leigo Total | "Consigo fazer sem saber nada de crypto?" | P0 iniciante, tutoriais |
| Entusiasta Crypto | "Isso me convence a tentar WAX?" | WAX, provably-fair, seguranca |
| Bingueiro Tradicional | "Por que trocar meu bingo de sempre?" | Modos jogo, RTP, tutoriais |
| Gamer GameFi | "Nao e outro ponzi? Tokenomics faz sentido?" | Tokenomics, RTP, economia |
| Investidor | "Colocaria capital neste ecossistema?" | Tokenomics, roadmap, staking |
| Dev/Builder | "Consigo integrar com este conteudo?" | Smart contracts, API, tecnicos |
| Criador de Conteudo | "Faria um video sobre isso?" | Roadmap, seguranca, economia |
| Sponsor/Parceiro | "Associar minha marca e seguro?" | Roadmap, metricas, equipe |
| Membro da Comunidade | "Reflete perguntas reais do Discord?" | Seguranca, tutoriais, comunidade |

**Fluxo de trabalho:**

1. Core team produz rascunho inicial
2. Rascunho circula para especialistas produtores disponiveis
3. Cada especialista avalia se consegue contribuir. Pode declarar "sem contribuicao neste ponto".
4. Especialistas que contribuem refinam entre si ate consenso
5. **Rodada de publico-alvo:** core team seleciona 1-2 personas de audiencia relevantes ao topico. Elas avaliam eficacia do ponto de vista do leitor.
6. Feedback da audiencia incorporado ao rascunho
7. Lead faz analise final e aprova ou pede revisao de pontos especificos
8. Outputs (decisoes, contextos, ajustes) sao indexados no RAG para reuso futuro

**Criacao de novas personas (produtoras ou de publico-alvo):** Se durante o fluxo um gap nao for coberto por nenhuma persona existente, uma nova pode ser criada e adicionada ao catalogo (`docs/guides/content-personas.md`). O sistema atende uma comunidade completa — jogadores, criadores de conteudo, streamers, influenciadores, sponsors, integradores, etc. Cada novo segmento de publico pode gerar sua propria persona avaliadora.

#### 4.7.5 Conteudo Legado

A revisao do conteudo existente (2 posts blog + 1 tutorial) ocorre **apos** a producao do novo conteudo. O aprendizado e os refinamentos aplicados nos novos artigos guiarao as correcoes nos antigos. Toda a equipe de personas participa da revisao.

Escopo da revisao legado: todo conteudo publicado ou planejado (incluindo os 6 posts P0 que serao criados antes).

#### 4.7.6 Documentacao e RAG

Decisoes, contextos, inputs e outputs de cada fluxo de personas sao:
1. Documentados em `docs/guides/content-personas.md`
2. Indexados no MCP RAG com tags como `content-quality`, `persona-decision`, `images`, `callout`, `template`
3. Reutilizaveis como ponto de partida em fluxos futuros com temas ou dificuldades similares

---

## 5. Track 3 — Legal Page TOC

### 5.1 Scroll Tracking Fix

**Problema atual:** `IntersectionObserver` com `rootMargin: '-80px 0px -40% 0px'` + sem fallback quando nada esta intersectando → highlight preso no primeiro heading.

**Solucao: scroll-position-based tracking** (mais confiavel que IntersectionObserver para TOC):

```typescript
function useActiveHeading(
  headingIds: string[],
  offset: number = 100,
): string | null {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    if (!headingIds.length) return;

    const handleScroll = () => {
      const scrollY = window.scrollY + offset;
      let current: string | null = null;

      for (let i = headingIds.length - 1; i >= 0; i--) {
        const el = document.getElementById(headingIds[i]);
        if (el && el.offsetTop <= scrollY) {
          current = headingIds[i];
          break;
        }
      }
      setActiveId(current);
    };

    handleScroll(); // initial
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [headingIds, offset]);

  return activeId;
}
```

**Beneficios:** Nao precisa de `IntersectionObserver`, funciona em scroll normal, atualiza a cada frame, nao trava.

### 5.2 Mobile TOC

- Substituir `<details>` por accordion controlado (state `isOpen`)
- Fechar automaticamente apos click em link
- Destacar heading ativo com mesma cor do desktop

### 5.3 Heading Anchor Icons

- Adicionar `#` icon visivel no hover de h2
- `scroll-margin-top: 100px` para compensar header fixo
- Smooth scroll via CSS `scroll-behavior: smooth`

### 5.4 Componentes Extraidos

| Componente         | De                                      |
| ------------------ | --------------------------------------- |
| `TocSidebar`       | Inline em PageView → componente proprio |
| `useActiveHeading` | Nova hook                               |
| `AnchorHeading`    | h2 com `#` link e scroll-margin         |

---

## 6. Track 4 — Navigation

### 6.1 Breadcrumbs

**Componente:** `Breadcrumbs.tsx`

```
Home > Blog > Como Funciona o RNG
```

- Schema.org `BreadcrumbList` structured data
- Props: `segments: Array<{ label: string; href?: string }>`
- Ultimo segmento sem link (pagina atual)
- Usado em: BlogPost, TutorialPost, PageView (legal)

### 6.2 Index Navigation

BlogIndex e TutorialsIndex ganham:

- **Tag filter chips:** `?tag=rng` URL param. Click em tag no post → filtra index
- **Sort dropdown:** Mais recentes / Mais antigos / A-Z
- **Pagination:** 12 items/pagina, numeros de pagina, `?page=2`
- **Search input:** MiniSearch integrado no topo do index (versao simplificada do search overlay)

### 6.3 Article Bottom Navigation

**BlogPost footer:**

```
┌──────────────────────────────────────────┐
│  ── Artigos Relacionados ──              │
│  [card] [card] [card]                    │
│                                          │
│  ← Post Anterior    Proximo Post →      │
│                                          │
│  ← Voltar para Blog                      │
└──────────────────────────────────────────┘
```

**TutorialPost footer:**

```
┌──────────────────────────────────────────┐
│  Passo 2 de 5                            │
│  ████████░░░░░░░░░░░░ 40%               │
│                                          │
│  ← Passo Anterior    Proximo Passo →    │
└──────────────────────────────────────────┘
```

### 6.4 Related Posts Data Flow

```typescript
// lib/content.ts — new functions

function computeRelatedPosts(slug: string, locale: string): BlogPost[] {
  const allPosts = loadBlogPosts(locale);
  const current = allPosts.find((p) => p.slug === slug);
  if (!current) return [];

  // Check manual override first
  if (current.related?.length) {
    return allPosts.filter((p) => current.related.includes(p.slug));
  }

  // Tag overlap scoring
  return allPosts
    .filter((p) => p.slug !== slug)
    .map((p) => ({
      post: p,
      score:
        jaccardSimilarity(p.tags, current.tags) +
        (p.category === current.category ? 0.3 : 0),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map((r) => r.post);
}
```

---

## 7. Track 5 — Search System

### 7.1 Client-Side: MiniSearch

**Por que MiniSearch:**

- 5.9 kB gzip — negligible para SSG, code-split via dynamic import
- BM25 scoring + fuzzy (typo tolerance) + prefix (as-you-type) + field boosting
- CJK support ok para ZH
- JSON serializavel → gera index no build, serve como JSON estatico

**Index generation:** `scripts/generate-search-index.mjs`

```
content/**/* → generate-search-index.mjs → public/search-index-{locale}.json

pnpm build = generate-search-index.mjs && react-router build && generate-sitemap.mjs
```

**Index format (por locale):**

```json
{
  "documents": [
    {
      "id": "blog/rng-explicado",
      "title": "RNG Explicado",
      "description": "Como funciona...",
      "type": "blog",
      "locale": "pt",
      "url": "/pt/blog/rng-explicado",
      "body": "texto puro..."
    }
  ],
  "index": { ... } // MiniSearch serializado
}
```

Fields: `title` (boost 3x), `description` (boost 2x), `body` (boost 1x).

### 7.2 Componentes

```
src/
  components/
    SearchTrigger.tsx     — icone lupa no Header (Cmd+K)
    SearchOverlay.tsx     — modal fullscreen com input + resultados
    SearchResults.tsx     — resultados agrupados por tipo
  hooks/
    useSearch.ts          — lazy-load MiniSearch + index JSON
```

**`useSearch` hook:**

```typescript
function useSearch(locale: string) {
  // lazy state: null → loading → MiniSearch instance
  useEffect(() => {
    const [MiniSearch, indexData] = await Promise.all([
      import("minisearch"),
      fetch(`/search-index-${locale}.json`).then((r) => r.json()),
    ]);
    const ms = MiniSearch.loadJSON(indexData, {
      fields: ["title", "description", "body"],
    });
    setEngine(ms);
  }, [locale]);

  const search = (query: string) => {
    if (!engine) return [];
    return engine.search(query, {
      fuzzy: 0.2,
      prefix: true,
      boost: { title: 3, description: 2, body: 1 },
    });
  };

  return { search, isReady: engine !== null };
}
```

**SearchOverlay:** Cmd+K ou click lupa → overlay com autofoco → resultados atualizam a cada tecla → Escape fecha.

### 7.3 API Fallback — PostgreSQL Full-Text

**Endpoint:** `POST /api/search` (nova Azure Function)

**Query params:** `{ q: string, locale: string }`

**PG schema:**

```sql
CREATE TABLE search_documents (
  id          TEXT PRIMARY KEY,
  locale      TEXT NOT NULL,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  description TEXT,
  url         TEXT NOT NULL,
  body        TEXT NOT NULL,
  ts          TSVECTOR GENERATED ALWAYS AS (
    setweight(to_tsvector('simple', coalesce(title,'')), 'A') ||
    setweight(to_tsvector('simple', coalesce(description,'')), 'B') ||
    setweight(to_tsvector('simple', coalesce(body,'')), 'C')
  ) STORED
);

CREATE INDEX idx_search_ts ON search_documents USING GIN(ts);
CREATE INDEX idx_search_locale ON search_documents(locale);
```

**Sync:** Script de build POSTs documents para API apos gerar index JSON.

### 7.4 Fallback Logic

```
User digita → MiniSearch carregado?
  ├─ SIM → busca local (instantanea, offline)
  └─ NAO → fetch API (lento mas confiavel)
↓
Resultados agrupados por tipo: blog > tutorial > faq > page
```

Na pratica MiniSearch sempre carregado (5.9 kB + ~20 kB index = instantaneo em 4G). API fallback para edge cases.

### 7.5 Cache

| Layer     | Cache                        | TTL                         |
| --------- | ---------------------------- | --------------------------- |
| Browser   | HTTP cache search-index JSON | 1h (stale-while-revalidate) |
| CDN (SWA) | Cache-Control                | 1h                          |
| API       | Redis                        | 5 min                       |

---

## 8. Dependencias entre Tracks

```
Track 0 (Bug Fixes)
  ├── desbloqueia → Track 1 (UX/UI — typography fix + components)
  │     └── componentes reutilizados por → Track 3 (TOC)
  │     └── componentes reutilizados por → Track 4 (Navigation)
  ├── Track 2 (Content — independente, paralelo)
  ├── Track 3 (TOC - independente, paralelo, mas usa ContentHeader)
  ├── Track 4 (Navigation — depende de components da Track 1)
  └── Track 5 (Search — depende do index de conteudo da Track 2)
```

**Ordem recomendada:**

1. **Track 0** (bugs) — rapido, desbloqueia visual
2. **Track 1** (UX/UI typography + componentes base) — fundacao visual
3. **Track 3** (TOC fix) — usa componentes da T1
4. **Track 2** (Content) + **Track 4** (Navigation) — paralelo
5. **Track 5** (Search) — depende do conteudo expandido

---

## 9. Arquivos Alterados / Criados

### Modificados

- `apps/landing-page/src/components/Header.tsx` — Ideias fix, search trigger
- `apps/landing-page/src/pages/BlogPost.tsx` — layout completo, related posts
- `apps/landing-page/src/pages/BlogIndex.tsx` — filter, sort, pagination
- `apps/landing-page/src/pages/TutorialPost.tsx` — step layout, progress
- `apps/landing-page/src/pages/TutorialsIndex.tsx` — filter, sort
- `apps/landing-page/src/pages/PageView.tsx` — TOC fix, extrair components
- `apps/landing-page/src/styles/globals.css` — prose customizations
- `apps/landing-page/lib/content.ts` — computeRelatedPosts, tags/category
- `apps/landing-page/package.json` — @tailwindcss/typography, minisearch
- `apps/landing-page/react-router.config.ts` — prerender search-index
- `apps/landing-page/api/host.json` — nova rota search (se aplicavel)

### Criados

- `apps/landing-page/src/components/Breadcrumbs.tsx`
- `apps/landing-page/src/components/TocSidebar.tsx`
- `apps/landing-page/src/components/ContentHeader.tsx`
- `apps/landing-page/src/components/ContentBody.tsx`
- `apps/landing-page/src/components/RelatedContent.tsx`
- `apps/landing-page/src/components/PrevNextNav.tsx`
- `apps/landing-page/src/components/Pagination.tsx`
- `apps/landing-page/src/components/TagFilter.tsx`
- `apps/landing-page/src/components/SortDropdown.tsx`
- `apps/landing-page/src/components/SearchTrigger.tsx`
- `apps/landing-page/src/components/SearchOverlay.tsx`
- `apps/landing-page/src/components/SearchResults.tsx`
- `apps/landing-page/src/hooks/useSearch.ts`
- `apps/landing-page/src/hooks/useActiveHeading.ts`
- `apps/landing-page/src/hooks/useReadingProgress.ts`
- `apps/landing-page/scripts/generate-search-index.mjs`
- `apps/landing-page/api/search.ts` (Function endpoint)
- `content/blog/{locale}/*.md` (14 artigos — 8 novos + 6 beginner)
- `content/tutorials/{locale}/*.md` (9 tutoriais — 1 existente + 8 novos)

---

## 10. Testes

- Componentes: vitest por componente ~10 testes cada
- Hooks: `useSearch`, `useActiveHeading`, `useReadingProgress`
- Content: `computeRelatedPosts` unit test
- Search: `generate-search-index.mjs` integracao
- E2E: `apps/e2e-ui` Tier 1 (intercept + fixtures) para search e navegacao

---

## 11. Riscos

| Risco                                      | Severidade | Mitigacao                                  |
| ------------------------------------------ | ---------- | ------------------------------------------ |
| Content backlog escorrega prazo | Media | Priorizar P0 leigos, postergar P2 |
| Beginner content requer pesquisa | Baixa | Research briefs ja compilados com fontes |
| Search index desatualizado                 | Baixa      | Build-time generation, TTL 1h              |
| prose customizacao quebra layout existente | Media      | Testar em staging, manter fallback         |
| MiniSearch bundle impact                   | Baixa      | Code-split via dynamic import              |
| PG full-text performance                   | Baixa      | So ~100 documentos, GIN index, Redis cache |
