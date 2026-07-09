# Plan A: UX Foundations — Bug Fixes + Blog/Tutorials UX/UI

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Corrigir bugs criticos e estabelecer fundacao visual para todo o conteudo da landing page.

**Architecture:** Tailwind CSS v4 typography plugin + componentes reutilizaveis ContentHeader/ContentBody/BlogPost/TutorialPost + hooks de leitura.

**Tech Stack:** React Router v7, Tailwind CSS v4, @tailwindcss/typography, vitest

## Global Constraints

- SSG prerender (`ssr:false`) — sem acesso a server runtime
- i18n pt/en/zh obrigatorio em todo texto visivel
- TDD (RED→GREEN) com vitest para todo componente novo
- Sem comentarios em codigo
- Nao mexer em `index.html` ou `app/root.tsx`
- Nomes de commit PT-BR no padrao conventional commits

---

### Task 0.1: Fix Ideias Header Link

**Files:**
- Modify: `apps/landing-page/src/components/Header.tsx`

**Interfaces:**
- Consumes: `currentLocale` do hook `useParams()` ou do contexto de i18n
- Produces: link funcional para `/{locale}/ideas`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/components/__tests__/Header.test.tsx
// Locate existing test and add:
test('ideas link uses locale prefix', () => {
  render(<Header />);
  const link = screen.getByRole('link', { name: /ideias/i });
  expect(link.getAttribute('href')).toMatch(/^\/\w{2}\/ideas$/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL — href is `/ideas` not `/{locale}/ideas`

- [ ] **Step 3: Fix the link**

```typescript
// apps/landing-page/src/components/Header.tsx
// Find line with: { type: 'internal', label: t('nav.ideas'), href: '/ideas' },
// Change href to use currentLocale:
{ type: 'internal', label: t('nav.ideas'), href: `/${currentLocale}/ideas` },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/components/Header.tsx
git commit -m "fix(landing): adiciona locale prefix no link Ideias
Header nav apontava para /ideas sem locale, causando redirect
para HomePage com locale='ideas'. Fix: href=/${currentLocale}/ideas
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 0.2: Install + Configure @tailwindcss/typography

**Files:**
- Modify: `apps/landing-page/package.json`
- Modify: `apps/landing-page/src/styles/globals.css`
- Modify: `apps/landing-page/pnpm-lock.yaml` (via pnpm install)

**Interfaces:**
- Consumes: Tailwind CSS v4 already configured
- Produces: `.prose` classes funcionando para todo conteudo HTML

- [ ] **Step 1: Install dependency**

Run:
```bash
pnpm --filter @cryptobingo/landing-page add -D @tailwindcss/typography
```

- [ ] **Step 2: Add plugin to globals.css**

```css
/* apps/landing-page/src/styles/globals.css — add at top after @import "tailwindcss" */
@plugin "@tailwindcss/typography";
```

- [ ] **Step 3: Add prose customizations for dark theme**

```css
/* apps/landing-page/src/styles/globals.css — add after existing theme vars */
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

- [ ] **Step 4: Create a test to verify prose is rendering**

```typescript
// apps/landing-page/src/pages/__tests__/BlogPost.test.tsx
// Add test:
test('renders body with prose classes', () => {
  render(<BlogPost />);
  const article = screen.getByRole('article');
  const bodyDiv = article.querySelector('.prose');
  expect(bodyDiv).toBeInTheDocument();
  expect(bodyDiv).toHaveClass('prose-invert');
});
```

- [ ] **Step 5: Run build to verify compilation**

Run: `pnpm --filter @cryptobingo/landing-page build`
Expected: Build succeeds, no Tailwind errors

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/package.json apps/landing-page/src/styles/globals.css
git commit -m "feat(landing): instala @tailwindcss/typography com tema escuro
Add plugin + prose-invert custom vars para dark theme.
Blog/tutorial HTML agora renderiza com estilo tipografico.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.1: Create useReadingProgress Hook

**Files:**
- Create: `apps/landing-page/src/hooks/useReadingProgress.ts`
- Create: `apps/landing-page/src/hooks/__tests__/useReadingProgress.test.tsx`

**Interfaces:**
- Produces: `{ progress: number, readTime: number }` — progress (0-100) e tempo estimado de leitura em minutos

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/hooks/__tests__/useReadingProgress.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useReadingProgress } from '../useReadingProgress';

describe('useReadingProgress', () => {
  test('returns 0 progress initially with no content', () => {
    const { result } = renderHook(() => useReadingProgress(''));
    expect(result.current.progress).toBe(0);
    expect(result.current.readTime).toBe(0);
  });

  test('estimates read time from word count', () => {
    const words = Array(1000).fill('word').join(' ');
    const { result } = renderHook(() => useReadingProgress(words));
    expect(result.current.readTime).toBe(5); // 1000 words / 200 wpm
  });

  test('progress is based on document scroll position', () => {
    const words = Array(2000).fill('word').join(' ');
    const { result } = renderHook(() => useReadingProgress(words));

    act(() => {
      // Simulate partial scroll: 500px out of 2000px total
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 500, writable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true });
      Object.defineProperty(document.documentElement, 'clientHeight', { value: 1000, writable: true });
      window.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.progress).toBeCloseTo(50, 0); // (500 / (2000-1000)) * 100
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the hook**

```typescript
// apps/landing-page/src/hooks/useReadingProgress.ts
import { useState, useEffect } from 'react';

function estimateReadTime(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

export function useReadingProgress(body: string) {
  const [progress, setProgress] = useState(0);
  const readTime = estimateReadTime(body);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const scrollTop = window.scrollY;
      const docHeight = document.documentElement.scrollHeight;
      const winHeight = window.innerHeight;
      const scrollable = docHeight - winHeight;

      if (scrollable <= 0) {
        setProgress(100);
        return;
      }

      setProgress(Math.min(100, Math.round((scrollTop / scrollable) * 100)));
    };

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return { progress, readTime };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/hooks/useReadingProgress.ts \
      apps/landing-page/src/hooks/__tests__/useReadingProgress.test.tsx
git commit -m "feat(landing): hook useReadingProgress com scroll tracking
Estima tempo de leitura (200 wpm) e progresso (0-100%) baseado
em scroll position. Usado pela reading progress bar.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.2: Create ContentHeader Component

**Files:**
- Create: `apps/landing-page/src/components/ContentHeader.tsx`
- Create: `apps/landing-page/src/components/__tests__/ContentHeader.test.tsx`

**Interfaces:**
- Consumes: `{ title: string; description?: string; cover?: string; author?: string; date?: string; tags?: string[]; readTime: number }`
- Produces: Componente header de artigo reutilizavel (blog + tutorial)

```typescript
interface ContentHeaderProps {
  title: string;
  description?: string;
  cover?: string;
  author?: string;
  date?: string;
  tags?: string[];
  readTime: number;
}
```

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/components/__tests__/ContentHeader.test.tsx
import { render, screen } from '@testing-library/react';
import { ContentHeader } from '../ContentHeader';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n/config';

const renderWithI18n = (ui: React.ReactElement) =>
  render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);

describe('ContentHeader', () => {
  const baseProps = {
    title: 'Test Post',
    description: 'A test description',
    author: 'CryptoBingo Team',
    date: '2026-07-04',
    tags: ['blockchain', 'guide'],
    readTime: 5,
  };

  test('renders title and description', () => {
    renderWithI18n(<ContentHeader {...baseProps} />);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Test Post');
    expect(screen.getByText('A test description')).toBeInTheDocument();
  });

  test('renders author, date and read time', () => {
    renderWithI18n(<ContentHeader {...baseProps} />);
    expect(screen.getByText(/CryptoBingo Team/)).toBeInTheDocument();
    expect(screen.getByText(/5 min/)).toBeInTheDocument();
  });

  test('renders tags as pills', () => {
    renderWithI18n(<ContentHeader {...baseProps} />);
    expect(screen.getByText('blockchain')).toBeInTheDocument();
    expect(screen.getByText('guide')).toBeInTheDocument();
  });

  test('renders cover image when provided', () => {
    renderWithI18n(<ContentHeader {...baseProps} cover="/blog/test-cover.png" />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/blog/test-cover.png');
  });

  test('renders fallback cover when not provided', () => {
    renderWithI18n(<ContentHeader {...baseProps} />);
    const img = screen.getByRole('img');
    expect(img).toHaveAttribute('src', '/og-image.png');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ContentHeader**

```typescript
// apps/landing-page/src/components/ContentHeader.tsx
import { ContentHeaderProps } from '../types/content';

export function ContentHeader({
  title, description, cover, author, date, tags, readTime,
}: ContentHeaderProps) {
  return (
    <header className="mb-8">
      <div className="relative w-full aspect-video rounded-xl overflow-hidden mb-6 bg-surface-800">
        <img
          src={cover || '/og-image.png'}
          alt={title}
          className="w-full h-full object-cover"
          loading="eager"
        />
      </div>
      <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
        {title}
      </h1>
      {description && (
        <p className="text-lg text-gray-400 mb-4">{description}</p>
      )}
      <div className="flex flex-wrap items-center gap-3 text-sm text-gray-500 mb-4">
        {author && <span>{author}</span>}
        {date && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={date}>
              {new Date(date).toLocaleDateString()}
            </time>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>{readTime} min de leitura</span>
      </div>
      {tags && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <a
              key={tag}
              href={`?tag=${tag}`}
              className="px-3 py-1 text-xs font-medium rounded-full bg-surface-700 text-brand-300 hover:bg-surface-600 transition-colors"
            >
              {tag}
            </a>
          ))}
        </div>
      )}
    </header>
  );
}
```

- [ ] **Step 4: Create shared types file**

```typescript
// apps/landing-page/src/types/content.ts
export interface ContentHeaderProps {
  title: string;
  description?: string;
  cover?: string;
  author?: string;
  date?: string;
  tags?: string[];
  readTime: number;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/src/components/ContentHeader.tsx \
      apps/landing-page/src/components/__tests__/ContentHeader.test.tsx \
      apps/landing-page/src/types/content.ts
git commit -m "feat(landing): componente ContentHeader reutilizavel
Cover image com fallback, metadata (author/date/readTime),
tags pills. Usado por blog e tutorial posts.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.3: Create ContentBody Component

**Files:**
- Create: `apps/landing-page/src/components/ContentBody.tsx`
- Create: `apps/landing-page/src/components/__tests__/ContentBody.test.tsx`

**Interfaces:**
- Consumes: `{ html: string }` — HTML body string de marked.parse()
- Produces: Wrapper com prose + reading progress bar

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/components/__tests__/ContentBody.test.tsx
import { render, screen } from '@testing-library/react';
import { ContentBody } from '../ContentBody';

describe('ContentBody', () => {
  test('renders HTML content safely', () => {
    const html = '<h2 id="title">Test</h2><p>Paragraph</p>';
    render(<ContentBody html={html} />);
    expect(screen.getByText('Test')).toBeInTheDocument();
    expect(screen.getByText('Paragraph')).toBeInTheDocument();
  });

  test('wraps content in prose classes', () => {
    const { container } = render(<ContentBody html="<p>text</p>" />);
    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper.className).toContain('prose');
    expect(wrapper.className).toContain('prose-invert');
  });

  test('renders reading progress bar', () => {
    render(<ContentBody html="<p>text</p>" />);
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL

- [ ] **Step 3: Implement ContentBody**

```typescript
// apps/landing-page/src/components/ContentBody.tsx
import { useReadingProgress } from '../hooks/useReadingProgress';

interface ContentBodyProps {
  html: string;
}

export function ContentBody({ html }: ContentBodyProps) {
  const { progress } = useReadingProgress(html);

  return (
    <>
      <div
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        className="fixed top-0 left-0 h-0.5 bg-brand-500 z-50 transition-all duration-150"
        style={{ width: `${progress}%` }}
      />
      <div
        className="prose prose-invert max-w-none"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/components/ContentBody.tsx \
      apps/landing-page/src/components/__tests__/ContentBody.test.tsx
git commit -m "feat(landing): componente ContentBody com prose + progress bar
Wrapper HTML seguro com prose-invert e reading progress bar fixa.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.4: Upgrade BlogPost to Use New Components

**Files:**
- Modify: `apps/landing-page/src/pages/BlogPost.tsx`
- Modify: `apps/landing-page/src/pages/__tests__/BlogPost.test.tsx`

**Interfaces:**
- Consumes: `ContentHeader`, `ContentBody` de tasks anteriores
- Produces: BlogPost completo com cover, metadata, tags, related posts placeholder

- [ ] **Step 1: Read current BlogPost.tsx**

Read the file to understand existing structure before modifying.

Run: `cat apps/landing-page/src/pages/BlogPost.tsx`

- [ ] **Step 2: Write the updated failing test**

```typescript
// apps/landing-page/src/pages/__tests__/BlogPost.test.tsx
// Add test for new layout:
test('renders with ContentHeader and ContentBody', () => {
  render(<BlogPost />);
  expect(screen.getByRole('article')).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
});

test('renders back to blog link at bottom', () => {
  render(<BlogPost />);
  const backLink = screen.getByText(/voltar/i);
  expect(backLink).toBeInTheDocument();
});
```

- [ ] **Step 3: Rewrite BlogPost**

```typescript
// apps/landing-page/src/pages/BlogPost.tsx
import { useLoaderData } from 'react-router';
import { loadBlogPost, type BlogPost as BlogPostData } from '../../lib/content';
import type { Route } from '../../.react-router/types/app/routes/blog/+types/post';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';
import { ContentHeader } from '~/components/ContentHeader';
import { ContentBody } from '~/components/ContentBody';
import { trackEvent } from '~/services/analytics';
import { useTranslation } from 'react-i18next';
import { Seo } from '~/components/Seo';

export function loader({ params }: Route.LoaderArgs) {
  const { locale, slug } = params;
  const post = loadBlogPost(slug!, locale!);
  if (!post) throw new Response('Post not found', { status: 404 });
  return post;
}

export default function BlogPost() {
  const post = useLoaderData<BlogPostData>();
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={`${post.title} — CryptoBingo`}
        description={post.description}
        canonical={`/${post.locale}/blog/${post.slug}`}
      />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <article>
          <ContentHeader
            title={post.title}
            description={post.description}
            cover={post.cover}
            author={post.author}
            date={post.date}
            tags={post.tags}
            readTime={post.readTime || 5}
          />
          <ContentBody html={post.body} />
        </article>
        <div className="mt-12 pt-8 border-t border-gray-800">
          <a
            href={`/${post.locale}/blog`}
            className="text-brand-400 hover:text-brand-300 transition-colors"
            onClick={() => trackEvent('blog_click', { post_slug: post.slug })}
          >
            ← {t('blog.back')}
          </a>
        </div>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Add locale keys for blog**

Add to all 3 locale files:
```json
{
  "blog": {
    "back": "← Voltar para Blog"
  }
}
```

For `en.json`:
```json
{ "blog": { "back": "← Back to Blog" } }
```

For `zh.json`:
```json
{ "blog": { "back": "← 返回博客" } }
```

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/src/pages/BlogPost.tsx \
      apps/landing-page/src/locales/en.json \
      apps/landing-page/src/locales/pt.json \
      apps/landing-page/src/locales/zh.json
git commit -m "feat(landing): BlogPost refatorado com ContentHeader + ContentBody
Cover image, metadata, tags pills, reading progress bar, back link.
i18n keys adicionadas para pt/en/zh.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.5: Upgrade TutorialPost to Use New Components

**Files:**
- Modify: `apps/landing-page/src/pages/TutorialPost.tsx`
- Modify: `apps/landing-page/src/pages/__tests__/TutorialPost.test.tsx`

**Interfaces:**
- Consumes: `ContentHeader`, `ContentBody`
- Produces: TutorialPost com step indicator e navegacao sequencial

- [ ] **Step 1: Read current TutorialPost.tsx**

Read the file to understand existing structure.

- [ ] **Step 2: Add locale keys for step navigation**

```json
{
  "tutorial": {
    "step": "Passo {current} de {total}",
    "previous": "← Anterior",
    "next": "Próximo →"
  }
}
```

For `en.json`:
```json
{ "tutorial": { "step": "Step {current} of {total}", "previous": "← Previous", "next": "Next →" } }
```

For `zh.json`:
```json
{ "tutorial": { "step": "第 {current} 步，共 {total} 步", "previous": "← 上一步", "next": "下一步 →" } }
```

- [ ] **Step 3: Rewrite TutorialPost**

```typescript
// apps/landing-page/src/pages/TutorialPost.tsx
import { useLoaderData } from 'react-router';
import { loadTutorialPost, type TutorialPost as TutorialData } from '../../lib/content';
import type { Route } from '../../.react-router/types/app/routes/tutorials/+types/post';
import { Header } from '~/components/Header';
import { Footer } from '~/components/Footer';
import { ContentHeader } from '~/components/ContentHeader';
import { ContentBody } from '~/components/ContentBody';
import { useTranslation } from 'react-i18next';
import { Seo } from '~/components/Seo';

export function loader({ params }: Route.LoaderArgs) {
  const { locale, slug } = params;
  const tutorial = loadTutorialPost(slug!, locale!);
  if (!tutorial) throw new Response('Tutorial not found', { status: 404 });
  // Load adjacent tutorials for prev/next navigation
  const all = loadTutorialPosts(locale!).sort((a, b) => a.order - b.order);
  const idx = all.findIndex(t => t.slug === slug);
  const previous = idx > 0 ? all[idx - 1] : null;
  const next = idx < all.length - 1 ? all[idx + 1] : null;
  return { tutorial, previous, next, total: all.length, current: idx + 1 };
}

export default function TutorialPost() {
  const { tutorial, previous, next, total, current } = useLoaderData<TutorialData>();
  const { t } = useTranslation();

  return (
    <>
      <Seo
        title={`${tutorial.title} — CryptoBingo`}
        description={tutorial.description}
      />
      <Header />
      <main className="max-w-3xl mx-auto px-4 py-20">
        <article>
          {/* Step Progress */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">
                {t('tutorial.step', { current, total })}
              </span>
              <span className="text-sm text-gray-500">{Math.round((current / total) * 100)}%</span>
            </div>
            <div className="w-full h-1 bg-surface-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-brand-500 rounded-full transition-all duration-300"
                style={{ width: `${(current / total) * 100}%` }}
              />
            </div>
          </div>

          <ContentHeader
            title={tutorial.title}
            description={tutorial.description}
            cover={tutorial.cover}
            tags={tutorial.tags}
            readTime={tutorial.readTime || 5}
          />
          <ContentBody html={tutorial.body} />

          {/* Sequential Navigation */}
          <nav className="mt-12 pt-8 border-t border-gray-800 flex items-center justify-between">
            <div>
              {previous && (
                <a
                  href={`/${tutorial.locale}/tutorials/${previous.slug}`}
                  className="text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {t('tutorial.previous')}: {previous.title}
                </a>
              )}
            </div>
            <div>
              {next && (
                <a
                  href={`/${tutorial.locale}/tutorials/${next.slug}`}
                  className="text-brand-400 hover:text-brand-300 transition-colors"
                >
                  {t('tutorial.next')}: {next.title}
                </a>
              )}
            </div>
          </nav>
        </article>
      </main>
      <Footer />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/pages/TutorialPost.tsx \
      apps/landing-page/src/locales/en.json \
      apps/landing-page/src/locales/pt.json \
      apps/landing-page/src/locales/zh.json
git commit -m "feat(landing): TutorialPost com step indicator + nav sequencial
Progress bar, sequential prev/next navigation, ContentHeader+Body.
i18n step/previous/next pt/en/zh.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.6: Upgrade BlogIndex with Improved Cards

**Files:**
- Modify: `apps/landing-page/src/pages/BlogIndex.tsx`
- Modify: `apps/landing-page/src/pages/__tests__/BlogIndex.test.tsx`

- [ ] **Step 1: Upgrade card layout with cover thumbnail + tags**

```typescript
// Inside BlogIndex, replace the card rendering with:
{posts.map((post) => (
  <Link
    key={post.slug}
    to={`/${locale}/blog/${post.slug}`}
    className="group bg-surface-800 rounded-xl border border-gray-800 overflow-hidden hover:border-brand-500/30 transition-all"
    onClick={() => trackEvent('blog_click', { post_slug: post.slug, post_title: post.title })}
  >
    <div className="aspect-[2/1] bg-surface-700 overflow-hidden">
      <img
        src={post.cover || '/og-image.png'}
        alt={post.title}
        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
        loading="lazy"
      />
    </div>
    <div className="p-6">
      {post.tags && post.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {post.tags.slice(0, 3).map(tag => (
            <span key={tag} className="px-2 py-0.5 text-xs rounded-full bg-surface-700 text-brand-300">
              {tag}
            </span>
          ))}
        </div>
      )}
      <h2 className="text-lg font-semibold text-white mb-2 group-hover:text-brand-300 transition-colors line-clamp-2">
        {post.title}
      </h2>
      <p className="text-sm text-gray-400 line-clamp-2 mb-3">{post.description}</p>
      <div className="flex items-center text-xs text-gray-500">
        {post.date && <time>{new Date(post.date).toLocaleDateString()}</time>}
        {post.author && <><span className="mx-2">·</span><span>{post.author}</span></>}
      </div>
    </div>
  </Link>
))}
```

- [ ] **Step 2: Update grid layout**

```tsx
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/pages/BlogIndex.tsx
git commit -m "feat(landing): BlogIndex cards com cover thumbnail e tags
Grid 1/2/3 colunas responsivo, cover image com lazy loading,
tags chips, metadata line, hover states.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 1.7: Ensure All Existing Tests Pass

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: All tests PASS

- [ ] **Step 2: Run build to verify**

Run: `pnpm --filter @cryptobingo/landing-page build`
Expected: Build succeeds

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "test(landing): verifica test suite + build apos UX Foundations
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
