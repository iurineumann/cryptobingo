# Plan D: Search System

> **For agentic workers:** Use superpowers:subagent-driven-development to implement.

**Goal:** Full-text search UX on landing page — client-side MiniSearch index generated at build time, with keyboard-triggered overlay for instant, offline-capable content discovery across blog/tutorials/FAQ/pages.

**Architecture:** Build script (`scripts/generate-search-index.mjs`) reads all content files, strips HTML, outputs `public/search-index-{locale}.json` per locale. React hooks lazy-load MiniSearch + index on first interaction. `SearchTrigger` in Header opens `SearchOverlay` modal with `SearchResults` grouped by content type. `Cmd+K` / `Ctrl+K` shortcut. Simplified text filter on BlogIndex/TutorialsIndex uses URL param `?q=` — no MiniSearch for index pages.

**Tech Stack:** MiniSearch 7 (dynamic import, 5.9kB gzip), React Router v7 SSG, vitest, i18next, lucide-react (Search icon)

## Process & Compliance (Obrigatorio)

Cada step **deve** seguir este checklist antes de considerar completo:

### Metodologia
- **TDD (RED→GREEN→refactor):** escrever teste primeiro, código mínimo para passar, refatorar.
- **1 commit por step lógico:** `tipo(escopo): descrição` em PT-BR. `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
- **Git flow:** feature branch → PR → develop. Nunca commit direto em develop.
- **SonarQube:** rodar `sonarqube_analyze_code_snippet` em cada arquivo `.ts`/`.tsx` modificado. Corrigir BLOCKER/CRITICAL/MAJOR antes do commit.

### Ferramentas
- **RAG:** consultar RAG ao iniciar cada step para reuso de decisoes anteriores (tags: `content-quality`, `images`, `figure`)
- **Skills:** carregar skill `frontend-feature` ao mexer em `src/`, `modern-typescript` para testes/refatoracao
- **Ensemble:** para steps com muitos arquivos (ex: criar 3 componentes + testes), considerar agentes paralelos

### Verificação pré-commit
```bash
# 1. Testes
pnpm --filter @cryptobingo/landing-page test

# 2. Build
pnpm --filter @cryptobingo/landing-page build

# 3. SonarQube em arquivos modificados

# 4. Git diff review — staging so arquivos intencionados
```

## Global Constraints
- SSG prerender (ssr:false). No `window`/`document` access during prerender.
- i18n pt/en/zh obrigatorio — 3 parallel indices.
- TDD com vitest (RED → GREEN → refactor)
- Sem comentarios em codigo
- Nao mexer em `index.html` ou `app/root.tsx`
- PT-BR conventional commits (tipo(escopo): ...)
- Nao adicionar runtime dependencies extras — MiniSearch via dynamic import
- Bundle impact < 10kB gzip (MiniSearch 5.9kB + index ~3kB compressed per locale)
- Code-split via dynamic import (`import("minisearch")`)
- data-testid em elementos interativos para E2E

## Files Created
- `scripts/generate-search-index.mjs` — index generator (Node runtime, .mjs)
- `src/hooks/useSearch.ts` — lazy MiniSearch hook
- `src/components/SearchTrigger.tsx` — magnifying glass icon + Cmd+K listener
- `src/components/SearchOverlay.tsx` — fullscreen modal
- `src/components/SearchResults.tsx` — grouped results renderer
- `src/hooks/__tests__/useSearch.test.ts`
- `src/components/__tests__/SearchTrigger.test.tsx`
- `src/components/__tests__/SearchOverlay.test.tsx`
- `src/components/__tests__/SearchResults.test.tsx`

## Files Modified
- `src/components/Header.tsx` — add `<SearchTrigger />` next to language switcher
- `package.json` — add `"minisearch": "^7"` to dependencies
- `react-router.config.ts` — add search-index.json to prerendered paths (or keep public/)
- `scripts/generate-sitemap.mjs` — ensure search-index-*.json excluded from sitemap (unnecessary but harmless)

## Cross-Dependency Note (Plan C)
Content ID format: `{type}/{slug}` (e.g., `blog/provably-fair`, `tutorial/comprar-tickets`, `page/terms`, `faq/o-que-e-cryptobingo`).
**Must match Plan C exactly.** Verify by checking `lib/content.ts` slug patterns before implementation.

---

## Step 1: Install MiniSearch

```bash
pnpm --filter @cryptobingo/landing-page add minisearch
```

Verification: `pnpm --filter @cryptobingo/landing-page ls --depth 0` shows minisearch in dependencies.

---

## Step 2: `scripts/generate-search-index.mjs`

Node script (runs during build, not bundled). Reads all content from `content/{blog,tutorial,faq,pages}/{locale}/`, strips HTML from body, outputs `public/search-index-{locale}.json`.

**Input sources:**

| Type | Dir | Ext | ID prefix | Slugs from |
|------|-----|-----|-----------|------------|
| blog | `content/blog/{locale}/` | `.md` | `blog/` | filename |
| tutorial | `content/tutorial/{locale}/` | `.mdx` | `tutorial/` | filename |
| faq | `content/faq/{locale}/` | `.md` | `faq/` | filename |
| page | `content/pages/{locale}/` | `.mdx` | `page/` | filename |

**ID format:** `{type}/{slug}` (e.g., `blog/provably-fair`, `tutorial/comprar-tickets`, `faq/o-que-e-cryptobingo`, `page/terms`)

**Output format** (per locale):
```json
{
  "documents": [
    {
      "id": "blog/provably-fair",
      "title": "Provably Fair no CryptoBingo",
      "description": "Entenda como cada sorteio e criptograficamente verificado",
      "type": "blog",
      "locale": "pt",
      "url": "/pt/blog/provably-fair",
      "images": [
        { "src": "/images/blog/provably-fair/commit-reveal.png", "alt": "Diagrama do protocolo", "caption": "Figura 1: Commit-Reveal" }
      ]
    }
  ],
  "index": { ... }
}
```

Note: `body` is used for building the MiniSearch index but is excluded from `storeFields` (not stored in output). `images` metadata is preserved for SEO and gallery features.

**Implementation:**

```javascript
// scripts/generate-search-index.mjs
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const LOCALES = ['en', 'pt', 'zh'];
const CONTENT_DIR = path.resolve(process.cwd(), 'content');
const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

const SOURCES = {
  blog:   { dir: 'blog',     ext: '.md',  prefix: 'blog' },
  tutorial: { dir: 'tutorial', ext: '.mdx', prefix: 'tutorial' },
  faq:    { dir: 'faq',      ext: '.md',  prefix: 'faq' },
  page:   { dir: 'pages',    ext: '.mdx', prefix: 'page' },
};

function stripHtml(html) {
  return html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function loadDocumentsForLocale(locale) {
  const docs = [];

  for (const [type, cfg] of Object.entries(SOURCES)) {
    const dirPath = path.join(CONTENT_DIR, cfg.dir, locale);
    if (!fs.existsSync(dirPath)) continue;

    const files = fs.readdirSync(dirPath).filter(f => f.endsWith(cfg.ext));

    for (const file of files) {
      const slug = file.replace(cfg.ext, '');
      const raw = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const { data, content } = matter(raw);

      const bodyHtml = marked.parse(content.trim());
      const body = stripHtml(bodyHtml);

      const images = Array.isArray(data.images) ? data.images : [];

      docs.push({
        id: `${cfg.prefix}/${slug}`,
        title: data.title || '',
        description: data.description || '',
        type: cfg.prefix,
        locale,
        url: `/${locale}/${cfg.prefix === 'page' ? '' : cfg.prefix + '/'}${slug}`,
        body,
        images,
      });
    }
  }

  return docs;
}

async function main() {
  const { default: MiniSearch } = await import('minisearch');

  for (const locale of LOCALES) {
    const documents = loadDocumentsForLocale(locale);
    const miniSearch = new MiniSearch({
      fields: ['title', 'description', 'body'],
      storeFields: ['id', 'title', 'description', 'type', 'locale', 'url'],
    });

    miniSearch.addAll(documents);

    const output = {
      documents: documents.map(({ body, images, ...rest }) => ({ ...rest, images })),
      index: miniSearch.toJSON(),
    };

    const outPath = path.join(PUBLIC_DIR, `search-index-${locale}.json`);
    fs.writeFileSync(outPath, JSON.stringify(output));
    console.log(`  ✓ search-index-${locale}.json (${documents.length} docs, ${fs.statSync(outPath).size} bytes)`);
  }
}

main().catch(console.error);
```

**Integration into build pipeline:** Modify `package.json` script:

```json
"build": "node scripts/generate-search-index.mjs && react-router build && node scripts/generate-sitemap.mjs"
```

**SSG note:** The JSON goes into `public/` which is copied verbatim to the build output. No prerender config needed for static assets.

---

## Step 3: `src/hooks/useSearch.ts`

Lazy-load MiniSearch + index JSON. SSR-safe (noop when no window).

```typescript
import { useState, useEffect, useCallback, useRef } from 'react';

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: string;
  locale: string;
  url: string;
  score: number;
  terms: string[];
  match: Record<string, string[]>;
}

interface UseSearchReturn {
  search: (query: string) => SearchResult[];
  isReady: boolean;
  load: () => void;
}

export function useSearch(locale: string): UseSearchReturn {
  const [engine, setEngine] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const loadingRef = useRef(false);

  const load = useCallback(() => {
    if (engine || loadingRef.current || typeof window === 'undefined') return;

    loadingRef.current = true;
    setLoading(true);

    Promise.all([
      import('minisearch'),
      fetch(`/search-index-${locale}.json`).then((r) => {
        if (!r.ok) throw new Error(`Search index fetch failed: ${r.status}`);
        return r.json();
      }),
    ])
      .then(([MiniSearchModule, indexData]) => {
        const ms = new (MiniSearchModule as any).default(
          { fields: ['title', 'description', 'body'], storeFields: ['id', 'title', 'description', 'type', 'locale', 'url', 'images'] },
        );
        const msInstance = ms.constructor.loadJSON
          ? ms.constructor.loadJSON(indexData.index, { fields: ['title', 'description', 'body'] })
          : (() => {
              const m = new (MiniSearchModule as any).default({
                fields: ['title', 'description', 'body'],
                storeFields: ['id', 'title', 'description', 'type', 'locale', 'url'],
              });
              m.import(indexData.index);
              return m;
            })();
        setEngine(msInstance);
        setLoading(false);
      })
      .catch((err) => {
        console.error('useSearch: failed to load index', err);
        setLoading(false);
        loadingRef.current = false;
      });
  }, [locale, engine]);

  const search = useCallback(
    (query: string): SearchResult[] => {
      if (!engine || !query.trim()) return [];

      const results = engine.search(query, {
        fuzzy: 0.2,
        prefix: true,
        boost: { title: 3, description: 2, body: 1 },
      });

      return results.map((r: any) => ({
        ...r,
      }));
    },
    [engine],
  );

  useEffect(() => {
    return () => {
      loadingRef.current = false;
    };
  }, []);

  return { search, isReady: engine !== null && !loading, load };
}
```

**SSR guard:** `typeof window === 'undefined'` prevents execution during prerender. `load()` is called only on user interaction (click on SearchTrigger or Cmd+K), never during mount — avoids wasteful fetch during SSG.

---

## Step 4: `src/components/SearchTrigger.tsx`

Magnifying glass icon in Header. Cmd+K / Ctrl+K keyboard listener.

```typescript
import { useEffect } from 'react';
import { Search } from 'lucide-react';

interface SearchTriggerProps {
  onClick: () => void;
}

export function SearchTrigger({ onClick }: SearchTriggerProps) {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClick();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  return (
    <button
      data-testid="search-trigger"
      onClick={onClick}
      aria-label="searchTrigger.ariaLabel"
      className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-surface-800"
    >
      <Search size={18} />
    </button>
  );
}
```

**Integration in Header.tsx** (line 134, before lang switcher `<div ref={langRef}>`):

Add search trigger import at top:
```typescript
import { SearchTrigger } from '@/components/SearchTrigger';
```

Add state + handler:
```typescript
const [searchOpen, setSearchOpen] = useState(false);
```

Add search trigger JSX before langRef div (desktop nav) and inside mobile drawer after timer:
```tsx
<SearchTrigger onClick={() => setSearchOpen(true)} />
```

Add SearchOverlay after the header closing `</header>` (or inside App.tsx at root level):
```tsx
{searchOpen && (
  <SearchOverlay
    locale={currentLocale}
    onClose={() => setSearchOpen(false)}
  />
)}
```

---

## Step 5: `src/components/SearchOverlay.tsx`

Full-screen modal. Auto-focus input. Escape closes. Backdrop click closes. Debounced 300ms.

```typescript
import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, X } from 'lucide-react';
import { useSearch, SearchResult } from '@/hooks/useSearch';
import { SearchResults } from './SearchResults';

interface SearchOverlayProps {
  locale: string;
  onClose: () => void;
}

export function SearchOverlay({ locale, onClose }: SearchOverlayProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const { search, isReady, load } = useSearch(locale);

  // Load search engine on mount (triggered by user, never on SSG)
  useEffect(() => {
    load();
  }, [load]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (!query.trim()) {
      setResults([]);
      setSelectedIndex(-1);
      return;
    }

    debounceRef.current = setTimeout(() => {
      const hits = search(query);
      setResults(hits);
      setSelectedIndex(-1);
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
        return;
      }

      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
        return;
      }

      if (e.key === 'Enter' && selectedIndex >= 0 && results[selectedIndex]) {
        window.location.href = results[selectedIndex].url;
        onClose();
        return;
      }
    },
    [onClose, results, selectedIndex],
  );

  // Backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  return (
    <div
      data-testid="search-overlay"
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[15vh] bg-surface-950/80 backdrop-blur-sm"
      onClick={handleBackdropClick}
      onKeyDown={handleKeyDown}
    >
      <div className="w-full max-w-2xl mx-4 bg-surface-800 border border-surface-600 rounded-2xl shadow-2xl overflow-hidden">
        {/* Input row */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-surface-700">
          <Search size={20} className="text-slate-400 shrink-0" />
          <input
            ref={inputRef}
            data-testid="search-input"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="searchTrigger.placeholder"
            className="flex-1 bg-transparent text-white placeholder-slate-500 outline-none text-lg"
          />
          <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-1 text-xs text-slate-500 bg-surface-700 rounded">
            ESC
          </kbd>
          <button
            data-testid="search-close"
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors p-1"
            aria-label="searchTrigger.close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Results area */}
        <div className="max-h-[60vh] overflow-y-auto">
          {query.trim() && !isReady && (
            <div className="p-8 text-center text-slate-500" data-testid="search-loading">
              searchTrigger.loading
            </div>
          )}

          {query.trim() && isReady && (
            <SearchResults results={results} selectedIndex={selectedIndex} onResultClick={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}
```

---

## Step 6: `src/components/SearchResults.tsx`

Renders grouped results by type order: blog > tutorial > faq > page.

```typescript
import { SearchResult } from '@/hooks/useSearch';
import { FileText, BookOpen, HelpCircle, File } from 'lucide-react';

interface SearchResultsProps {
  results: SearchResult[];
  selectedIndex: number;
  onResultClick: () => void;
}

const TYPE_ORDER: Record<string, number> = {
  blog: 0,
  tutorial: 1,
  faq: 2,
  page: 3,
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  blog: <FileText size={16} />,
  tutorial: <BookOpen size={16} />,
  faq: <HelpCircle size={16} />,
  page: <File size={16} />,
};

export function SearchResults({ results, selectedIndex, onResultClick }: SearchResultsProps) {
  if (results.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500" data-testid="search-no-results">
        searchTrigger.noResults
      </div>
    );
  }

  // Group by type, preserving type order
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  }

  const sortedTypes = Object.keys(groups).sort(
    (a, b) => (TYPE_ORDER[a] ?? 99) - (TYPE_ORDER[b] ?? 99),
  );

  let globalIndex = -1;

  return (
    <div data-testid="search-results" className="py-2">
      {sortedTypes.map((type) => {
        const items = groups[type];

        return (
          <div key={type} data-testid={`search-group-${type}`}>
            <div className="px-4 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {`searchGroup.${type}`}
            </div>
            {items.map((result) => {
              globalIndex++;
              const idx = globalIndex;

              return (
                <a
                  key={result.id}
                  href={result.url}
                  data-testid={`search-result-${idx}`}
                  data-selected={idx === selectedIndex ? 'true' : undefined}
                  onClick={onResultClick}
                  className={`flex items-start gap-3 px-4 py-3 transition-colors ${
                    idx === selectedIndex
                      ? 'bg-brand-500/20 text-white'
                      : 'text-slate-300 hover:bg-surface-700/50'
                  }`}
                >
                  <span className="mt-0.5 text-slate-500 shrink-0">
                    {TYPE_ICONS[type] || null}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium truncate">{result.title}</div>
                    {result.description && (
                      <div className="text-sm text-slate-400 truncate mt-0.5">
                        {result.description}
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-slate-600 uppercase shrink-0 mt-1">
                    {type}
                  </span>
                </a>
              );
            })}
          </div>
        );
      })}

      <div className="px-4 py-3 text-xs text-center text-slate-600 border-t border-surface-700 mt-2">
        {results.length} searchTrigger.resultCount
      </div>
    </div>
  );
}
```

---

## Step 7: BlogIndex/TutorialsIndex Simple Search

On `BlogIndex.tsx` and `TutorialsIndex.tsx`, add a text input that filters posts client-side by title/description match. Uses URL param `?q=` for persistence. NOT MiniSearch — simpler.

```typescript
// Inside BlogIndex.tsx / TutorialsIndex.tsx

import { useSearchParams } from 'react-router-dom';

export default function BlogIndex() {
  const [searchParams, setSearchParams] = useSearchParams();
  const filterQuery = searchParams.get('q') || '';

  // ... load posts ...

  const filtered = useMemo(() => {
    if (!filterQuery.trim()) return posts;
    const q = filterQuery.toLowerCase();
    return posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q),
    );
  }, [posts, filterQuery]);

  return (
    <div>
      {/* Search input */}
      <input
        data-testid="index-search"
        type="text"
        value={filterQuery}
        onChange={(e) => {
          const v = e.target.value;
          setSearchParams(v ? { q: v } : {});
        }}
        placeholder="indexSearch.placeholder"
        className="..."
      />

      {/* ... render filtered cards ... */}
    </div>
  );
}
```

---

## Step 8: Cache Strategy

The search index JSON is a static asset served from the CDN (Azure SWA / Cloudflare):

- **Browser HTTP cache:** `Cache-Control: public, max-age=3600, stale-while-revalidate=86400`
- Configured via `headers` in `staticwebapp.config.json` or `_headers` file:
  ```
  /search-index-*.json
    Cache-Control: public, max-age=3600, stale-while-revalidate=86400
  ```
- **API fallback (future):** Redis TTL 5min on index data, but no API implementation in this plan.
- **Rebuild invalidates:** Since the JSON is generated at build time and has a unique path (`search-index-{locale}.json`), CDN purges on deploy.

---

## Step 9: i18n Keys

Add to all 3 locale files (`src/locales/{en,pt,zh}.json`):

```json
{
  "searchTrigger": {
    "ariaLabel": "Search",
    "placeholder": "Search articles, tutorials, FAQ...",
    "close": "Close search",
    "loading": "Loading search index...",
    "noResults": "No results found. Try different keywords.",
    "resultCount": "results found"
  },
  "searchGroup": {
    "blog": "Blog",
    "tutorial": "Tutorials",
    "faq": "FAQ",
    "page": "Pages"
  },
  "indexSearch": {
    "placeholder": "Filter by title..."
  }
}
```

PT-BR:
```json
{
  "searchTrigger": {
    "ariaLabel": "Pesquisar",
    "placeholder": "Pesquisar artigos, tutoriais, FAQ...",
    "close": "Fechar pesquisa",
    "loading": "Carregando índice de busca...",
    "noResults": "Nenhum resultado encontrado. Tente outras palavras.",
    "resultCount": "resultados encontrados"
  },
  "searchGroup": {
    "blog": "Blog",
    "tutorial": "Tutoriais",
    "faq": "FAQ",
    "page": "Páginas"
  },
  "indexSearch": {
    "placeholder": "Filtrar por título..."
  }
}
```

ZH:
```json
{
  "searchTrigger": {
    "ariaLabel": "搜索",
    "placeholder": "搜索文章、教程、常见问题...",
    "close": "关闭搜索",
    "loading": "正在加载搜索索引...",
    "noResults": "未找到结果。请尝试其他关键词。",
    "resultCount": "个结果"
  },
  "searchGroup": {
    "blog": "博客",
    "tutorial": "教程",
    "faq": "常见问题",
    "page": "页面"
  },
  "indexSearch": {
    "placeholder": "按标题筛选..."
  }
}
```

---

## Step 10: Tests

### 10.1 `generate-search-index.mjs` Integration Test

Not a standard vitest test (Node script, output JSON). Create `scripts/__tests__/generate-search-index.test.mjs`:

```javascript
import { describe, it, expect, beforeAll } from 'vitest';
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

describe('generate-search-index.mjs', () => {
  beforeAll(() => {
    execSync('node scripts/generate-search-index.mjs', {
      cwd: process.cwd(),
    });
  });

  it('generates search-index-en.json', () => {
    const p = path.join(PUBLIC_DIR, 'search-index-en.json');
    expect(fs.existsSync(p)).toBe(true);
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(Array.isArray(data.documents)).toBe(true);
    expect(data.index).toBeDefined();
  });

  it('generates search-index-pt.json', () => {
    const p = path.join(PUBLIC_DIR, 'search-index-pt.json');
    expect(fs.existsSync(p)).toBe(true);
    const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
    expect(data.documents.length).toBeGreaterThan(0);
  });

  it('generates search-index-zh.json', () => {
    const p = path.join(PUBLIC_DIR, 'search-index-zh.json');
    expect(fs.existsSync(p)).toBe(true);
  });

  it('each document has required fields', () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(PUBLIC_DIR, 'search-index-en.json'), 'utf-8'),
    );
    for (const doc of data.documents) {
      expect(doc.id).toMatch(/^(blog|tutorial|faq|page)\//);
      expect(typeof doc.title).toBe('string');
      expect(typeof doc.type).toBe('string');
      expect(typeof doc.url).toBe('string');
      expect(doc.locale).toBe('en');
    }
  });

  it('documents do not contain HTML in body', () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(PUBLIC_DIR, 'search-index-en.json'), 'utf-8'),
    );
    for (const doc of data.documents) {
      expect(doc.body).toBeUndefined();
    }
  });

  it('each document has images array', () => {
    const data = JSON.parse(
      fs.readFileSync(path.join(PUBLIC_DIR, 'search-index-en.json'), 'utf-8'),
    );
    for (const doc of data.documents) {
      expect(Array.isArray(doc.images)).toBe(true);
    }
  });
});
```

### 10.2 `useSearch` Hook Test

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSearch } from '../useSearch';

const mockMiniSearchInstance = {
  search: vi.fn((query: string, opts?: any) => {
    if (query === 'rng') return [{ id: 'blog/rng-explicado', title: 'RNG Explicado', score: 1.0, terms: ['rng'], match: { title: ['rng'] } }];
    return [];
  }),
};

const mockMiniSearchModule = {
  default: vi.fn().mockImplementation(() => mockMiniSearchInstance),
};

vi.mock('minisearch', () => mockMiniSearchModule);

const mockIndexData = {
  index: { documents: [], index: {} },
};

beforeEach(() => {
  vi.clearAllMocks();
  global.fetch = vi.fn(() =>
    Promise.resolve({
      ok: true,
      json: () => Promise.resolve(mockIndexData),
    }),
  ) as any;
});

describe('useSearch', () => {
  it('returns isReady=false initially, isReady=true after load', async () => {
    const { result } = renderHook(() => useSearch('en'));

    expect(result.current.isReady).toBe(false);

    act(() => {
      result.current.load();
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });
  });

  it('returns search results from MiniSearch', async () => {
    const { result } = renderHook(() => useSearch('en'));

    act(() => {
      result.current.load();
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      const hits = result.current.search('rng');
      expect(hits).toHaveLength(1);
      expect(hits[0].id).toBe('blog/rng-explicado');
    });
  });

  it('returns empty array for empty query', async () => {
    const { result } = renderHook(() => useSearch('en'));

    act(() => {
      result.current.load();
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(true);
    });

    act(() => {
      const hits = result.current.search('');
      expect(hits).toHaveLength(0);
    });
  });

  it('does not fetch during SSR (no window)', () => {
    const { win } = global as any;
    delete (global as any).window;

    const { result } = renderHook(() => useSearch('en'));
    expect(result.current.isReady).toBe(false);
    expect(result.current.search('test')).toEqual([]);

    (global as any).window = win;
  });

  it('handles fetch failure gracefully', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('Network error'))) as any;

    const { result } = renderHook(() => useSearch('en'));

    act(() => {
      result.current.load();
    });

    await waitFor(() => {
      expect(result.current.isReady).toBe(false);
    });
  });
});
```

### 10.3 `SearchTrigger` Test

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SearchTrigger } from '../SearchTrigger';

describe('SearchTrigger', () => {
  it('renders search icon button', () => {
    render(<SearchTrigger onClick={vi.fn()} />);
    expect(screen.getByTestId('search-trigger')).toBeInTheDocument();
  });

  it('fires onClick on click', () => {
    const onClick = vi.fn();
    render(<SearchTrigger onClick={onClick} />);
    fireEvent.click(screen.getByTestId('search-trigger'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Cmd+K', () => {
    const onClick = vi.fn();
    render(<SearchTrigger onClick={onClick} />);
    fireEvent.keyDown(document, { key: 'k', metaKey: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Ctrl+K', () => {
    const onClick = vi.fn();
    render(<SearchTrigger onClick={onClick} />);
    fireEvent.keyDown(document, { key: 'k', ctrlKey: true });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire on other keys', () => {
    const onClick = vi.fn();
    render(<SearchTrigger onClick={onClick} />);
    fireEvent.keyDown(document, { key: 'a', metaKey: true });
    expect(onClick).not.toHaveBeenCalled();
  });

  it('has aria-label attribute', () => {
    render(<SearchTrigger onClick={vi.fn()} />);
    expect(screen.getByTestId('search-trigger')).toHaveAttribute('aria-label');
  });

  it('removes keyboard listener on unmount', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');
    const removeSpy = vi.spyOn(document, 'removeEventListener');

    const { unmount } = render(<SearchTrigger onClick={vi.fn()} />);
    const handler = addSpy.mock.calls.find(([event]) => event === 'keydown')?.[1];

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', handler);
  });
});
```

### 10.4 `SearchOverlay` Test

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SearchOverlay } from '../SearchOverlay';

const mockSearch = vi.fn();
const mockLoad = vi.fn();

vi.mock('@/hooks/useSearch', () => ({
  useSearch: () => ({
    search: mockSearch,
    isReady: true,
    load: mockLoad,
  }),
}));

vi.mock('../SearchResults', () => ({
  SearchResults: ({ results }: any) => (
    <div data-testid="search-results-mock">
      {results.length} results
    </div>
  ),
}));

beforeEach(() => {
  vi.clearAllMocks();
  mockSearch.mockReturnValue([]);
});

describe('SearchOverlay', () => {
  it('renders overlay with input', () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    expect(screen.getByTestId('search-overlay')).toBeInTheDocument();
    expect(screen.getByTestId('search-input')).toBeInTheDocument();
  });

  it('calls load on mount', () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  it('focuses input on mount', () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    expect(document.activeElement).toBe(screen.getByTestId('search-input'));
  });

  it('debounces search on input change', async () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    const input = screen.getByTestId('search-input');

    fireEvent.change(input, { target: { value: 'rng' } });

    // Not called immediately (debounce 300ms)
    expect(mockSearch).not.toHaveBeenCalled();

    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('rng');
    }, { timeout: 500 });
  });

  it('closes on Escape key in input', () => {
    const onClose = vi.fn();
    render(<SearchOverlay locale="en" onClose={onClose} />);
    fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on backdrop click', () => {
    const onClose = vi.fn();
    render(<SearchOverlay locale="en" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('search-overlay'));
    expect(onClose).toHaveBeenCalled();
  });

  it('does not close on inner click', () => {
    const onClose = vi.fn();
    render(<SearchOverlay locale="en" onClose={onClose} />);
    const inner = screen.getByTestId('search-input');
    fireEvent.click(inner);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders close button', () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    expect(screen.getByTestId('search-close')).toBeInTheDocument();
  });

  it('close button triggers onClose', () => {
    const onClose = vi.fn();
    render(<SearchOverlay locale="en" onClose={onClose} />);
    fireEvent.click(screen.getByTestId('search-close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('clears results on empty query after debounce', async () => {
    render(<SearchOverlay locale="en" onClose={vi.fn()} />);
    const input = screen.getByTestId('search-input');

    // Type something first
    fireEvent.change(input, { target: { value: 'rng' } });
    await waitFor(() => {
      expect(mockSearch).toHaveBeenCalledWith('rng');
    }, { timeout: 500 });

    // Clear it
    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => {
      expect(screen.queryByTestId('search-results-mock')).not.toBeInTheDocument();
    }, { timeout: 500 });
  });
});
```

### 10.5 `SearchResults` Test

```typescript
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SearchResults } from '../SearchResults';

const sampleResults = [
  { id: 'blog/rng-explicado', title: 'RNG Explicado', description: 'Como funciona o RNG', type: 'blog', locale: 'pt', url: '/pt/blog/rng-explicado', score: 2.5, terms: ['rng'], match: { title: ['rng'] } },
  { id: 'tutorial/comprar-tickets', title: 'Comprar Tickets', description: 'Guia de compra', type: 'tutorial', locale: 'pt', url: '/pt/tutorials/comprar-tickets', score: 1.8, terms: ['ticket'], match: { title: ['ticket'] } },
  { id: 'faq/o-que-e-cryptobingo', title: 'O que e CryptoBingo?', description: '', type: 'faq', locale: 'pt', url: '/pt/faq/o-que-e-cryptobingo', score: 1.2, terms: ['bingo'], match: { title: ['bingo'] } },
  { id: 'page/terms', title: 'Terms of Service', description: 'Termos de uso', type: 'page', locale: 'en', url: '/en/terms', score: 0.8, terms: ['term'], match: { title: ['term'] } },
];

describe('SearchResults', () => {
  it('renders grouped results', () => {
    render(<SearchResults results={sampleResults} selectedIndex={-1} onResultClick={vi.fn()} />);
    expect(screen.getByTestId('search-results')).toBeInTheDocument();
    expect(screen.getByTestId('search-group-blog')).toBeInTheDocument();
    expect(screen.getByTestId('search-group-tutorial')).toBeInTheDocument();
    expect(screen.getByTestId('search-group-faq')).toBeInTheDocument();
    expect(screen.getByTestId('search-group-page')).toBeInTheDocument();
  });

  it('renders result titles and descriptions', () => {
    render(<SearchResults results={sampleResults} selectedIndex={-1} onResultClick={vi.fn()} />);
    expect(screen.getByText('RNG Explicado')).toBeInTheDocument();
    expect(screen.getByText('Como funciona o RNG')).toBeInTheDocument();
    expect(screen.getByText('Comprar Tickets')).toBeInTheDocument();
  });

  it('shows no results state when empty', () => {
    render(<SearchResults results={[]} selectedIndex={-1} onResultClick={vi.fn()} />);
    expect(screen.getByTestId('search-no-results')).toBeInTheDocument();
  });

  it('highlights selected item', () => {
    render(<SearchResults results={sampleResults} selectedIndex={0} onResultClick={vi.fn()} />);
    const first = screen.getByTestId('search-result-0');
    expect(first.getAttribute('data-selected')).toBe('true');
  });

  it('all results are links with correct href', () => {
    render(<SearchResults results={sampleResults} selectedIndex={-1} onResultClick={vi.fn()} />);
    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/pt/blog/rng-explicado');
    expect(links[1]).toHaveAttribute('href', '/pt/tutorials/comprar-tickets');
  });

  it('renders type badges', () => {
    render(<SearchResults results={sampleResults} selectedIndex={-1} onResultClick={vi.fn()} />);
    expect(screen.getByText('blog')).toBeInTheDocument();
    expect(screen.getByText('tutorial')).toBeInTheDocument();
    expect(screen.getByText('faq')).toBeInTheDocument();
    expect(screen.getByText('page')).toBeInTheDocument();
  });

  it('renders result count footer', () => {
    render(<SearchResults results={sampleResults} selectedIndex={-1} onResultClick={vi.fn()} />);
    expect(screen.getByText(/4/)).toBeInTheDocument();
  });
});
```

---

## Step 11: Verification Checklist

Before PR:

```bash
# 1. Generate search index
pnpm --filter @cryptobingo/landing-page exec node scripts/generate-search-index.mjs

# 2. Verify JSON output exists
ls -la apps/landing-page/public/search-index-*.json

# 3. Run tests
pnpm --filter @cryptobingo/landing-page test

# 4. Build
pnpm --filter @cryptobingo/landing-page build

# 5. Verify search-index-*.json in build output
ls -la apps/landing-page/dist/build/search-index-*.json || ls -la apps/landing-page/dist/client/search-index-*.json

# 6. Quick sanity: open blog index page and verify search input renders
#    (manual check via preview server)
```

---

## Step 12: Future Work (API Fallback)

Spec sections 7.3-7.4 describe PostgreSQL full-text search API endpoint. Not implemented in this plan because:

1. MiniSearch covers all current needs (~100 documents total across 3 locales)
2. Azure Function infra changes are outside scope
3. API fallback adds latency vs instant local search
4. If content grows >1000 documents, implement:
   - `api/search.ts` — Function with PG `ts_query` full-text search
   - `useSearch` fallback: if MiniSearch not loaded after 2s, fetch API
   - Sync hook: POST documents to API after index generation

---

## Step 13: SonarQube

Before each commit, run sonarqube_analyze_code_snippet on:
- `src/hooks/useSearch.ts`
- `src/components/SearchTrigger.tsx`
- `src/components/SearchOverlay.tsx`
- `src/components/SearchResults.tsx`
- `src/components/Figure.tsx`

Fix BLOCKER/CRITICAL/MAJOR before commit.

---

## Edge Cases

| Edge Case | Handling |
|-----------|----------|
| Zero content files | Script outputs empty documents array, valid JSON |
| Fetch failure (offline) | `catch` in useSearch, `isReady` stays false, user sees loading state |
| CJK queries (zh) | MiniSearch handles CJK natively; `prefix: true` enables as-you-type |
| Very long queries | MiniSearch caps internally; no explicit limit needed |
| Multiple locales | 3 parallel JSON files, loaded per locale |
| Cmd+K on blog page | Global listener from SearchTrigger works anywhere |
| Search index outdated | Rebuilt every deploy; 1h browser TTL |
| SSG prerender time | Noop — `typeof window === 'undefined'` guard in useSearch |
| Overlay on mobile | Fullscreen, auto-focus opens keyboard on tap |
| Keyboard nav wrap | ArrowDown stops at last item (no wrap); ArrowUp stops at 0 |
