# Plan B: Navigation & TOC — Tracks 3 & 4

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** Corrigir TOC scroll tracking em paginas legais + adicionar breadcrumbs, pagination, tag filter, related posts, cross-content navigation.

**Architecture:** Hooks (useActiveHeading) + componentes extraidos (TocSidebar, Breadcrumbs, RelatedContent, PrevNextNav, Pagination, TagFilter) + logica build-time em lib/content.ts.

**Tech Stack:** React Router v7, Tailwind CSS v4, vitest

## Global Constraints
- SSG prerender (ssr:false)
- i18n pt/en/zh obrigatorio
- TDD (RED→GREEN) com vitest
- Sem comentarios em codigo
- Nao mexer em index.html ou app/root.tsx
- PT-BR conventional commits

---

### Task 3.1: Create useActiveHeading Hook

**Files:**
- Create: `apps/landing-page/src/hooks/useActiveHeading.ts`
- Create: `apps/landing-page/src/hooks/__tests__/useActiveHeading.test.tsx`

**Interfaces:**
- Produces: `(headingIds: string[], offset?: number) => string | null`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/hooks/__tests__/useActiveHeading.test.tsx
import { renderHook, act } from '@testing-library/react';
import { useActiveHeading } from '../useActiveHeading';

describe('useActiveHeading', () => {
  beforeEach(() => {
    document.body.innerHTML = `
      <div id="section1" style="height:800px;margin-top:0">Section 1</div>
      <div id="section2" style="height:800px;margin-top:1600px">Section 2</div>
      <div id="section3" style="height:800px;margin-top:3200px">Section 3</div>
    `;
  });

  test('returns null initially when no heading is in view', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    expect(result.current).toBeNull();
  });

  test('returns first heading when scrolled past it', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 200;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('section1');
  });

  test('returns second heading when scrolled past first two', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 1800;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBe('section2');
  });

  test('returns null when scrolled above all headings', () => {
    const { result } = renderHook(() => useActiveHeading(['section1', 'section2', 'section3'], 100));
    act(() => {
      window.scrollY = 0;
      window.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL

- [ ] **Step 3: Implement useActiveHeading**

```typescript
// apps/landing-page/src/hooks/useActiveHeading.ts
import { useState, useEffect } from 'react';

export function useActiveHeading(headingIds: string[], offset = 100): string | null {
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

    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [headingIds, offset]);

  return activeId;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/hooks/useActiveHeading.ts \
      apps/landing-page/src/hooks/__tests__/useActiveHeading.test.tsx
git commit -m "feat(landing): hook useActiveHeading scroll-position tracking
Scroll-based heading detection, reverse-order iteration,
passive listener, SSR guard. Substitui IntersectionObserver
que travava highlight no primeiro heading.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3.2: Extract TocSidebar Component

**Files:**
- Create: `apps/landing-page/src/components/TocSidebar.tsx`
- Create: `apps/landing-page/src/components/__tests__/TocSidebar.test.tsx`
- Modify: `apps/landing-page/src/pages/PageView.tsx`

**Interfaces:**
- Consumes: `{ headings: Array<{ id: string; text: string }>, locale: string }`
- Uses: `useActiveHeading` hook

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/components/__tests__/TocSidebar.test.tsx
import { render, screen } from '@testing-library/react';
import { TocSidebar } from '../TocSidebar';

describe('TocSidebar', () => {
  const headings = [
    { id: 'intro', text: 'Introduction' },
    { id: 'details', text: 'Details' },
    { id: 'conclusion', text: 'Conclusion' },
  ];

  test('renders all headings', () => {
    render(<TocSidebar headings={headings} />);
    expect(screen.getByText('Introduction')).toBeInTheDocument();
    expect(screen.getByText('Details')).toBeInTheDocument();
    expect(screen.getByText('Conclusion')).toBeInTheDocument();
  });

  test('renders "On this page" label', () => {
    render(<TocSidebar headings={headings} />);
    expect(screen.getByText(/on this page/i)).toBeInTheDocument();
  });

  test('renders desktop sidebar with sticky positioning', () => {
    const { container } = render(<TocSidebar headings={headings} />);
    const aside = container.querySelector('aside');
    expect(aside).toBeInTheDocument();
    expect(aside.className).toContain('sticky');
  });

  test('renders mobile collapsible TOC', () => {
    render(<TocSidebar headings={headings} />);
    // Mobile version uses a <details> or controlled accordion
    const mobileNav = screen.getByTestId('toc-mobile');
    expect(mobileNav).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: FAIL

- [ ] **Step 3: Implement TocSidebar**

```typescript
// apps/landing-page/src/components/TocSidebar.tsx
import { useActiveHeading } from '../hooks/useActiveHeading';
import { useState } from 'react';

interface TocHeading {
  id: string;
  text: string;
}

interface TocSidebarProps {
  headings: TocHeading[];
}

export function TocSidebar({ headings }: TocSidebarProps) {
  const activeId = useActiveHeading(headings.map(h => h.id));
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!headings.length) return null;

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:block">
        <div className="sticky top-24">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-500 mb-4">
            On this page
          </h2>
          <nav className="space-y-1">
            {headings.map(h => (
              <a
                key={h.id}
                href={`#${h.id}`}
                className={`block text-sm py-1.5 border-l-2 pl-4 transition-all ${
                  activeId === h.id
                    ? 'border-brand-500 text-brand-300 font-medium'
                    : 'border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200'
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        </div>
      </aside>

      {/* Mobile collapsible TOC */}
      <div data-testid="toc-mobile" className="lg:hidden mb-8">
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="w-full flex items-center justify-between px-4 py-3 bg-white/5 rounded-lg border border-gray-700/50 text-sm text-gray-300"
          aria-expanded={mobileOpen}
        >
          <span>On this page</span>
          <svg className={`w-4 h-4 transition-transform ${mobileOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {mobileOpen && (
          <nav className="mt-2 px-2 py-2 bg-white/5 rounded-lg border border-gray-700/50">
            {headings.map(h => (
              <a
                key={h.id}
                href={`#${h.id}`}
                onClick={() => setMobileOpen(false)}
                className={`block text-sm py-2 px-3 rounded transition-colors ${
                  activeId === h.id
                    ? 'text-brand-300 bg-brand-500/10 font-medium'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`}
              >
                {h.text}
              </a>
            ))}
          </nav>
        )}
      </div>
    </>
  );
}
```

- [ ] **Step 4: Refactor PageView to use TocSidebar**

Read current `PageView.tsx` and replace the inline TOC with:

```typescript
// Remove the inline TOC and mobile details elements
// Replace with:
{page.headings?.length > 0 && (
  <TocSidebar headings={page.headings} />
)}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/landing-page/src/components/TocSidebar.tsx \
      apps/landing-page/src/components/__tests__/TocSidebar.test.tsx \
      apps/landing-page/src/pages/PageView.tsx
git commit -m "feat(landing): extrai TocSidebar com scroll tracking fixo
Substitui IntersectionObserver por scroll-position tracking.
Mobile accordion controlado, fecha ao clicar em link.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 3.3: Add Heading Anchor Icons + CSS

**Files:**
- Modify: `apps/landing-page/src/styles/globals.css`
- Modify: `apps/landing-page/src/pages/PageView.tsx`

- [ ] **Step 1: Add CSS for heading anchors**

```css
/* apps/landing-page/src/styles/globals.css — add after .legal-doc-body styles */
html {
  scroll-behavior: smooth;
}

.legal-doc-body h2 {
  scroll-margin-top: 100px;
}

.legal-doc-body h2 .anchor-link {
  opacity: 0;
  margin-left: 0.5rem;
  color: var(--color-brand-400);
  font-weight: 300;
  text-decoration: none;
  transition: opacity 0.15s;
}

.legal-doc-body h2:hover .anchor-link {
  opacity: 1;
}
```

- [ ] **Step 2: Update the marked renderer in content.ts to add anchor links**

Read `lib/content.ts` and update the legalRenderer heading function:

```typescript
// lib/content.ts — in legalRenderer.heading
legalRenderer.heading = function ({ text, depth }: Tokens.Heading) {
  const id = slugify(text);
  if (depth === 2) {
    return `<h${depth} id="${id}">${text}<a href="#${id}" class="anchor-link" aria-hidden="true">#</a></h${depth}>`;
  }
  return `<h${depth} id="${id}">${text}</h${depth}>`;
};
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/styles/globals.css \
      apps/landing-page/lib/content.ts
git commit -m "feat(landing): anchor icons nos headings legais + smooth scroll
scroll-margin-top 100px, # icon visivel no hover,
scroll-behavior smooth no html.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4.1: Create Breadcrumbs Component

**Files:**
- Create: `apps/landing-page/src/components/Breadcrumbs.tsx`
- Create: `apps/landing-page/src/components/__tests__/Breadcrumbs.test.tsx`

**Interfaces:**
- Consumes: `{ segments: Array<{ label: string; href?: string }> }`

- [ ] **Step 1: Write the failing test**

```typescript
// apps/landing-page/src/components/__tests__/Breadcrumbs.test.tsx
import { render, screen } from '@testing-library/react';
import { Breadcrumbs } from '../Breadcrumbs';

describe('Breadcrumbs', () => {
  const segments = [
    { label: 'Home', href: '/en' },
    { label: 'Blog', href: '/en/blog' },
    { label: 'RNG Explicado' },
  ];

  test('renders all segments with separators', () => {
    render(<Breadcrumbs segments={segments} />);
    expect(screen.getByText('Home')).toBeInTheDocument();
    expect(screen.getByText('Blog')).toBeInTheDocument();
    expect(screen.getByText('RNG Explicado')).toBeInTheDocument();
  });

  test('last segment is plain text, others are links', () => {
    render(<Breadcrumbs segments={segments} />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', '/en');
    expect(links[1]).toHaveAttribute('href', '/en/blog');
  });

  test('renders schema.org JSON-LD', () => {
    const { container } = render(<Breadcrumbs segments={segments} />);
    const script = container.querySelector('script[type="application/ld+json"]');
    expect(script).toBeInTheDocument();
    const json = JSON.parse(script.textContent!);
    expect(json['@type']).toBe('BreadcrumbList');
  });

  test('renders chevron separator between items', () => {
    const { container } = render(<Breadcrumbs segments={segments} />);
    const separators = container.querySelectorAll('[data-testid="breadcrumb-sep"]');
    expect(separators).toHaveLength(segments.length - 1);
  });
});
```

- [ ] **Step 2: Run tests, then implement**

```typescript
// apps/landing-page/src/components/Breadcrumbs.tsx
interface BreadcrumbSegment {
  label: string;
  href?: string;
}

interface BreadcrumbsProps {
  segments: BreadcrumbSegment[];
}

export function Breadcrumbs({ segments }: BreadcrumbsProps) {
  const items = segments.map((s, i) => ({
    '@type': 'ListItem' as const,
    position: i + 1,
    name: s.label,
    ...(s.href ? { item: s.href } : {}),
  }));

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items,
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-gray-500 mb-6">
        {segments.map((s, i) => (
          <span key={i} className="flex items-center gap-2">
            {i > 0 && (
              <span data-testid="breadcrumb-sep" aria-hidden="true" className="text-gray-600">
                /
              </span>
            )}
            {s.href ? (
              <a href={s.href} className="hover:text-brand-400 transition-colors">
                {s.label}
              </a>
            ) : (
              <span className="text-gray-300">{s.label}</span>
            )}
          </span>
        ))}
      </nav>
    </>
  );
}
```

- [ ] **Step 3: Run tests, commit**

Run: `pnpm --filter @cryptobingo/landing-page test`

```bash
git add apps/landing-page/src/components/Breadcrumbs.tsx \
      apps/landing-page/src/components/__tests__/Breadcrumbs.test.tsx
git commit -m "feat(landing): componente Breadcrumbs com schema.org JSON-LD
Segments com label + href opcional, ultimo segmento sem link,
chevron separators, structured data para SEO.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4.2: Add Breadcrumbs to Pages

**Files:**
- Modify: `apps/landing-page/src/pages/BlogPost.tsx`
- Modify: `apps/landing-page/src/pages/BlogIndex.tsx`
- Modify: `apps/landing-page/src/pages/TutorialPost.tsx`
- Modify: `apps/landing-page/src/pages/TutorialsIndex.tsx`
- Modify: `apps/landing-page/src/pages/PageView.tsx`

- [ ] **Step 1: Add Breadcrumbs to each page**

**BlogPost:**
```typescript
import { Breadcrumbs } from '~/components/Breadcrumbs';

// Inside component, after Header:
<Breadcrumbs
  segments={[
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('nav.blog'), href: `/${locale}/blog` },
    { label: post.title },
  ]}
/>
```

**BlogIndex:**
```typescript
<Breadcrumbs
  segments={[
    { label: t('nav.home'), href: `/${lang}` },
    { label: t('nav.blog') },
  ]}
/>
```

**TutorialPost:**
```typescript
<Breadcrumbs
  segments={[
    { label: t('nav.home'), href: `/${locale}` },
    { label: t('nav.tutorials'), href: `/${locale}/tutorials` },
    { label: tutorial.title },
  ]}
/>
```

**TutorialsIndex:**
```typescript
<Breadcrumbs
  segments={[
    { label: t('nav.home'), href: `/${lang}` },
    { label: t('nav.tutorials') },
  ]}
/>
```

**PageView (legal):**
```typescript
<Breadcrumbs
  segments={[
    { label: t('nav.home'), href: `/${locale}` },
    { label: page.title },
  ]}
/>
```

- [ ] **Step 2: Add any missing locale keys**

Check all 3 locales for `nav.home`, `nav.blog`, `nav.tutorials`.

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @cryptobingo/landing-page test`

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/pages/BlogPost.tsx \
      apps/landing-page/src/pages/BlogIndex.tsx \
      apps/landing-page/src/pages/TutorialPost.tsx \
      apps/landing-page/src/pages/TutorialsIndex.tsx \
      apps/landing-page/src/pages/PageView.tsx \
      apps/landing-page/src/locales/en.json \
      apps/landing-page/src/locales/pt.json \
      apps/landing-page/src/locales/zh.json
git commit -m "feat(landing): breadcrumbs em blog, tutorial e paginas legais
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4.3: Create RelatedContent + PrevNextNav Components

**Files:**
- Create: `apps/landing-page/src/components/RelatedContent.tsx`
- Create: `apps/landing-page/src/components/__tests__/RelatedContent.test.tsx`
- Create: `apps/landing-page/src/components/PrevNextNav.tsx`
- Create: `apps/landing-page/src/components/__tests__/PrevNextNav.test.tsx`
- Modify: `apps/landing-page/lib/content.ts`

**Interfaces:**
- `RelatedContent`: `{ items: Array<{ title: string; slug: string; cover?: string }>, type: 'blog' | 'tutorial' }`
- `PrevNextNav`: `{ previous?: { title: string; slug: string } | null; next?: { title: string; slug: string } | null }`
- `computeRelatedPosts(slug, locale)`: `BlogPost[]`

- [ ] **Step 1: Write tests**

```typescript
// apps/landing-page/src/components/__tests__/RelatedContent.test.tsx
import { render, screen } from '@testing-library/react';
import { RelatedContent } from '../RelatedContent';

describe('RelatedContent', () => {
  const items = [
    { title: 'Post 1', slug: 'post-1' },
    { title: 'Post 2', slug: 'post-2' },
  ];

  test('renders related posts heading', () => {
    render(<RelatedContent items={items} type="blog" />);
    expect(screen.getByText(/relacionados/i)).toBeInTheDocument();
  });

  test('renders all items as links', () => {
    render(<RelatedContent items={items} type="blog" />);
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(2);
  });

  test('returns null when items is empty', () => {
    const { container } = render(<RelatedContent items={[]} type="blog" />);
    expect(container.firstChild).toBeNull();
  });
});
```

```typescript
// apps/landing-page/src/components/__tests__/PrevNextNav.test.tsx
import { render, screen } from '@testing-library/react';
import { PrevNextNav } from '../PrevNextNav';

describe('PrevNextNav', () => {
  test('renders both links when both exist', () => {
    render(
      <PrevNextNav
        locale="pt"
        basePath="/pt/blog"
        previous={{ title: 'Post 1', slug: 'post-1' }}
        next={{ title: 'Post 3', slug: 'post-3' }}
      />
    );
    expect(screen.getByText(/post 1/i)).toBeInTheDocument();
    expect(screen.getByText(/post 3/i)).toBeInTheDocument();
  });

  test('renders only next when no previous', () => {
    render(
      <PrevNextNav
        locale="pt"
        basePath="/pt/blog"
        next={{ title: 'Post 2', slug: 'post-2' }}
      />
    );
    expect(screen.getByText(/post 2/i)).toBeInTheDocument();
  });

  test('returns null when neither exists', () => {
    const { container } = render(
      <PrevNextNav locale="pt" basePath="/pt/blog" />
    );
    expect(container.firstChild).toBeNull();
  });
});
```

- [ ] **Step 2: Implement components**

```typescript
// apps/landing-page/src/components/RelatedContent.tsx
import { useTranslation } from 'react-i18next';

interface RelatedItem {
  title: string;
  slug: string;
  cover?: string;
}

interface RelatedContentProps {
  items: RelatedItem[];
  type: 'blog' | 'tutorial';
  locale: string;
}

export function RelatedContent({ items, type, locale }: RelatedContentProps) {
  const { t } = useTranslation();

  if (!items.length) return null;

  const basePath = type === 'blog' ? `/${locale}/blog` : `/${locale}/tutorials`;

  return (
    <section className="mt-12 pt-8 border-t border-gray-800">
      <h2 className="text-xl font-semibold text-white mb-6">
        {type === 'blog' ? t('content.relatedPosts') : t('content.relatedTutorials')}
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map(item => (
          <a
            key={item.slug}
            href={`${basePath}/${item.slug}`}
            className="block p-4 bg-surface-800 rounded-lg border border-gray-800 hover:border-brand-500/30 transition-all"
          >
            <h3 className="text-sm font-medium text-white line-clamp-2">{item.title}</h3>
          </a>
        ))}
      </div>
    </section>
  );
}
```

```typescript
// apps/landing-page/src/components/PrevNextNav.tsx
import { useTranslation } from 'react-i18next';

interface NavItem {
  title: string;
  slug: string;
}

interface PrevNextNavProps {
  locale: string;
  basePath: string;
  previous?: NavItem | null;
  next?: NavItem | null;
}

export function PrevNextNav({ locale, basePath, previous, next }: PrevNextNavProps) {
  const { t } = useTranslation();

  if (!previous && !next) return null;

  return (
    <nav className="mt-8 pt-6 border-t border-gray-800 flex items-center justify-between gap-4">
      <div className="flex-1">
        {previous && (
          <a
            href={`${basePath}/${previous.slug}`}
            className="group block text-left"
          >
            <span className="text-xs text-gray-500">{t('content.previous')}</span>
            <span className="block text-sm text-brand-400 group-hover:text-brand-300 transition-colors line-clamp-1">
              {previous.title}
            </span>
          </a>
        )}
      </div>
      <div className="flex-1 text-right">
        {next && (
          <a
            href={`${basePath}/${next.slug}`}
            className="group block text-right"
          >
            <span className="text-xs text-gray-500">{t('content.next')}</span>
            <span className="block text-sm text-brand-400 group-hover:text-brand-300 transition-colors line-clamp-1">
              {next.title}
            </span>
          </a>
        )}
      </div>
    </nav>
  );
}
```

- [ ] **Step 3: Add computeRelatedPosts to lib/content.ts**

```typescript
// lib/content.ts — add new function
export interface RelatedPost {
  title: string;
  slug: string;
  cover?: string;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (!a.length || !b.length) return 0;
  const intersection = a.filter(x => b.includes(x)).length;
  const union = new Set([...a, ...b]).size;
  return intersection / union;
}

export function computeRelatedPosts(
  slug: string,
  locale: string,
  type: 'blog' | 'tutorial' = 'blog'
): RelatedPost[] {
  const loadFn = type === 'blog' ? loadBlogPosts : loadTutorialPosts;
  const allPosts = loadFn(locale);
  const current = allPosts.find((p: any) => p.slug === slug);
  if (!current) return [];

  // Check manual override first
  if ((current as any).related?.length) {
    return allPosts
      .filter((p: any) => (current as any).related.includes(p.slug))
      .map((p: any) => ({ title: p.title, slug: p.slug, cover: p.cover }));
  }

  return allPosts
    .filter((p: any) => p.slug !== slug)
    .map((p: any) => ({
      post: p,
      score: jaccardSimilarity(p.tags || [], current.tags || []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => ({ title: r.post.title, slug: r.post.slug, cover: r.post.cover }));
}
```

- [ ] **Step 4: Add related posts to BlogPost loader**

```typescript
// In BlogPost loader:
const relatedPosts = computeRelatedPosts(slug!, locale!, 'blog');
return { post, relatedPosts };

// In component:
<RelatedContent items={relatedPosts} type="blog" locale={post.locale} />
<PrevNextNav locale={post.locale} basePath={`/${post.locale}/blog`} />
<Link to={`/${post.locale}/blog`} className="...">{t('blog.back')}</Link>
```

- [ ] **Step 5: Add i18n keys**

```json
{
  "content": {
    "relatedPosts": "Artigos Relacionados",
    "relatedTutorials": "Tutoriais Relacionados",
    "previous": "Anterior",
    "next": "Próximo"
  }
}
```

For en.json:
```json
{ "content": { "relatedPosts": "Related Posts", "relatedTutorials": "Related Tutorials", "previous": "Previous", "next": "Next" } }
```

For zh.json:
```json
{ "content": { "relatedPosts": "相关文章", "relatedTutorials": "相关教程", "previous": "上一篇", "next": "下一篇" } }
```

- [ ] **Step 6: Run tests, commit**

Run: `pnpm --filter @cryptobingo/landing-page test`

```bash
git add apps/landing-page/src/components/RelatedContent.tsx \
      apps/landing-page/src/components/__tests__/RelatedContent.test.tsx \
      apps/landing-page/src/components/PrevNextNav.tsx \
      apps/landing-page/src/components/__tests__/PrevNextNav.test.tsx \
      apps/landing-page/lib/content.ts \
      apps/landing-page/src/locales/en.json \
      apps/landing-page/src/locales/pt.json \
      apps/landing-page/src/locales/zh.json \
      apps/landing-page/src/pages/BlogPost.tsx
git commit -m "feat(landing): related posts + prev/next nav
computeRelatedPosts com Jaccard tag overlap + manual override.
RelatedContent e PrevNextNav componentes.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4.4: Create Pagination + TagFilter Components

**Files:**
- Create: `apps/landing-page/src/components/Pagination.tsx`
- Create: `apps/landing-page/src/components/__tests__/Pagination.test.tsx`
- Create: `apps/landing-page/src/components/TagFilter.tsx`
- Create: `apps/landing-page/src/components/__tests__/TagFilter.test.tsx`
- Modify: `apps/landing-page/src/pages/BlogIndex.tsx`
- Modify: `apps/landing-page/src/pages/TutorialsIndex.tsx`

- [ ] **Step 1: Write tests**

```typescript
// Pagination test
describe('Pagination', () => {
  test('renders page numbers', () => {
    render(<Pagination current={1} total={5} basePath="/pt/blog" />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  test('current page is highlighted', () => {
    render(<Pagination current={3} total={5} basePath="/pt/blog" />);
    const current = screen.getByText('3');
    expect(current.closest('a')?.className).toContain('brand');
  });

  test('renders prev/next arrows', () => {
    render(<Pagination current={3} total={5} basePath="/pt/blog" />);
    expect(screen.getByLabelText(/anterior/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/próximo/i)).toBeInTheDocument();
  });
});
```

```typescript
// TagFilter test
describe('TagFilter', () => {
  const tags = ['blockchain', 'rng', 'guide', 'tutorial'];

  test('renders all tags', () => {
    render(<TagFilter tags={tags} activeTag={null} basePath="/pt/blog" />);
    expect(screen.getByText('blockchain')).toBeInTheDocument();
    expect(screen.getByText('rng')).toBeInTheDocument();
  });

  test('active tag is highlighted', () => {
    render(<TagFilter tags={tags} activeTag="rng" basePath="/pt/blog" />);
    const rng = screen.getByText('rng');
    expect(rng.closest('a')?.className).toContain('brand');
  });

  test('includes "All" option', () => {
    render(<TagFilter tags={tags} activeTag={null} basePath="/pt/blog" />);
    expect(screen.getByText(/todos/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Implement**

`Pagination.tsx` — renders page links with `?page=N` params, prev/next arrows, current page highlighted.

`TagFilter.tsx` — renders tag chips as links with `?tag=X` params, "All" option to clear filter.

- [ ] **Step 3: Integrate into BlogIndex and TutorialsIndex**

Add `?tag=` and `?page=` param handling in the loader. Filter posts by tag if present. Slice for pagination.

```typescript
// In BlogIndex loader — get params from URL
export function loader({ params, request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const tag = url.searchParams.get('tag');
  const page = parseInt(url.searchParams.get('page') || '1', 10);
  const posts = loadBlogPosts(params.locale!);
  const filtered = tag ? posts.filter(p => p.tags?.includes(tag)) : posts;
  const pageSize = 12;
  const totalPages = Math.ceil(filtered.length / pageSize);
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);
  return { posts: paged, totalPages, currentPage: page, activeTag: tag, allTags: [...new Set(posts.flatMap(p => p.tags || []))] };
}
```

- [ ] **Step 4: Run tests, commit**

Run: `pnpm --filter @cryptobingo/landing-page test`

```bash
git add apps/landing-page/src/components/Pagination.tsx \
      apps/landing-page/src/components/__tests__/Pagination.test.tsx \
      apps/landing-page/src/components/TagFilter.tsx \
      apps/landing-page/src/components/__tests__/TagFilter.test.tsx \
      apps/landing-page/src/pages/BlogIndex.tsx \
      apps/landing-page/src/pages/TutorialsIndex.tsx
git commit -m "feat(landing): pagination + tag filter para blog/tutorial
Tag filter via ?tag= URL param, pagination 12/page,
componentes reutilizaveis entre BlogIndex e TutorialsIndex.
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

### Task 4.5: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `pnpm --filter @cryptobingo/landing-page test`
Expected: All PASS

- [ ] **Step 2: Run build**

Run: `pnpm --filter @cryptobingo/landing-page build`
Expected: Build succeeds

- [ ] **Step 3: Commit any remaining locale fixes**

```bash
git add -A
git commit -m "chore(landing): verifica testes e build Plan B
Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```
