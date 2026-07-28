import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked, Renderer, lexer } from 'marked';

const contentDir = path.resolve(process.cwd(), 'content');

interface SlugsIndex {
  [type: string]: {
    [canonicalId: string]: {
      [locale: string]: string;
    };
  };
}

let slugsCache: SlugsIndex | null = null;

function loadSlugsIndex(): SlugsIndex {
  if (slugsCache) return slugsCache;
  const filePath = path.join(contentDir, 'slugs.json');
  if (fs.existsSync(filePath)) {
    slugsCache = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } else {
    slugsCache = {};
  }
  return slugsCache!;
}

export function getLocalizedSlug(type: string, canonicalId: string, locale: string): string | null {
  const index = loadSlugsIndex();
  return index[type]?.[canonicalId]?.[locale] || null;
}

export function getCanonicalId(type: string, slug: string, locale: string): string | null {
  const index = loadSlugsIndex();
  const entries = index[type];
  if (!entries) return null;
  for (const [canonical, slugs] of Object.entries(entries)) {
    if (slugs[locale] === slug) return canonical;
  }
  return null;
}

function slugify(text: string): string {
    return text.toLowerCase().replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '');
}

const legalRenderer = new Renderer();
legalRenderer.heading = function ({ text, depth }: { text: string; depth: number; tokens: unknown[] }) {
    const id = slugify(text);
    if (depth === 2) {
        return `<h${depth} id="${id}">${text}<a href="#${id}" class="anchor-link" aria-hidden="true">#</a></h${depth}>`;
    }
    return `<h${depth} id="${id}">${text}</h${depth}>`;
};
legalRenderer.image = function ({ href, text, title }: { href: string; text: string; title?: string | null }) {
    const img = `<img src="${href}" alt="${text}" loading="lazy" class="rounded-lg w-full h-auto bg-surface-800" />`;
    if (title) {
        return `<figure class="my-8">${img}<figcaption class="mt-3 text-center text-sm text-gray-500 italic">${title}</figcaption></figure>`;
    }
    return img;
};
marked.use({ renderer: legalRenderer });

export function renderMarkdown(content: string): string {
    return String(marked.parse(content));
}

interface FAQEntry {
  question: string;
  answer: string;
}

interface FAQItem {
  question: string;
  answer: string;
  category: string;
  order: number;
  slug: string;
}

interface BlogPost {
  title: string;
  description: string;
  date: string;
  author: string;
  cover: string;
  tags: string[];
  body: string;
  slug: string;
  faq?: FAQEntry[];
}

interface HomeSettings {
  hero: {
    title: string;
    subtitle: string;
    cta_text: string;
    cta_link: string;
  };
  features: Array<{ title: string; description: string; icon: string }>;
  social: { telegram: string; discord: string; twitter: string; github: string };
}

function pickLocale(obj: Record<string, string> | undefined, locale: string): string {
  if (!obj) return '';
  return obj[locale] || obj.en || '';
}

export function loadSettings(locale: string = 'pt'): HomeSettings {
  const filePath = path.join(contentDir, 'settings', 'home.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  const data = JSON.parse(raw);

  return {
    hero: {
      title: pickLocale(data.hero?.title, locale),
      subtitle: pickLocale(data.hero?.subtitle, locale),
      cta_text: pickLocale(data.hero?.cta_text, locale),
      cta_link: data.hero?.cta_link || '',
    },
    features: (data.features || []).map((f: Record<string, unknown>) => ({
      title: pickLocale((f as { title?: Record<string, string> }).title as Record<string, string> | undefined, locale),
      description: pickLocale((f as { description?: Record<string, string> }).description as Record<string, string> | undefined, locale),
      icon: (f as { icon?: string }).icon || '',
    })),
    social: data.social || { telegram: '', discord: '', twitter: '', github: '' },
  };
}

export function loadFAQItems(locale: string = 'pt'): FAQItem[] {
  const faqDir = path.join(contentDir, 'faq', locale);
  if (!fs.existsSync(faqDir)) return [];

  const files = fs.readdirSync(faqDir).filter(f => f.endsWith('.md'));

  return files.map(file => {
    const raw = fs.readFileSync(path.join(faqDir, file), 'utf-8');
    const { data, content } = matter(raw);
    return {
      question: data.question || '',
      answer: content.trim(),
      category: data.category || 'general',
      order: data.order || 99,
      slug: file.replace(/\.md$/, ''),
    } satisfies FAQItem;
  }).sort((a, b) => a.order - b.order);
}

export function loadBlogPosts(locale: string = 'pt'): BlogPost[] {
  const blogDir = path.join(contentDir, 'blog', locale);
  if (!fs.existsSync(blogDir)) return [];

  const files = fs.readdirSync(blogDir).filter(f => f.endsWith('.md'));

  return files.map(file => {
    const raw = fs.readFileSync(path.join(blogDir, file), 'utf-8');
    const { data, content } = matter(raw);
    const canonicalId = file.replace(/\.md$/, '');
    const slug = getLocalizedSlug('blog', canonicalId, locale) || canonicalId;
    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      author: data.author || '',
      cover: data.cover || '',
      tags: data.tags || [],
      body: String(marked.parse(content.trim())),
      faq: data.faq as FAQEntry[] | undefined,
    } satisfies BlogPost;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function loadBlogPost(slug: string, locale: string = 'pt'): BlogPost | null {
  const canonicalId = getCanonicalId('blog', slug, locale);
  // O slugs.json 'blog' usa canonicalId em PT, mas os arquivos .md usam o slug
  // (filename) como nome. Se o arquivo do canonicalId não existir, tenta o slug direto
  // como filename — espelha o que loadBlogPosts (listagem) já faz. Sem isso, o post
  // individual cai no fallback 'Post not found' no cliente, divergindo do SSG e
  // disparando React #418 (mismatch de texto na hidratação).
  const candidates = [canonicalId, slug].filter(Boolean) as string[];
  for (const id of candidates) {
    const filePath = path.join(contentDir, 'blog', locale, `${id}.md`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      return {
        slug,
        title: data.title || '',
        description: data.description || '',
        date: data.date || '',
        author: data.author || '',
        cover: data.cover || '',
        tags: data.tags || [],
        body: String(marked.parse(content.trim())),
        faq: data.faq as FAQEntry[] | undefined,
      } satisfies BlogPost;
    }
  }
  return null;
}

interface TutorialItem {
  title: string;
  description: string;
  body: string;
  slug: string;
  order: number;
  faq?: FAQEntry[];
}

export function loadTutorials(locale: string = 'en'): TutorialItem[] {
  const tutorialDir = path.join(contentDir, 'tutorial', locale);
  if (!fs.existsSync(tutorialDir)) return [];

  const files = fs.readdirSync(tutorialDir).filter(f => f.endsWith('.mdx'));

  return files.map(file => {
    const raw = fs.readFileSync(path.join(tutorialDir, file), 'utf-8');
    const { data, content } = matter(raw);
    const canonicalId = file.replace(/\.mdx$/, '');
    const slug = getLocalizedSlug('tutorial', canonicalId, locale) || canonicalId;
    return {
      slug,
      title: data.title || '',
      description: data.description || '',
      body: content.trim(),
      order: data.order || 99,
      faq: data.faq as FAQEntry[] | undefined,
    } satisfies TutorialItem;
  }).sort((a, b) => a.order - b.order);
}

export function loadTutorialPost(slug: string, locale: string = 'en'): TutorialItem | null {
  const canonicalId = getCanonicalId('tutorial', slug, locale);
  // O slugs.json 'tutorial' usa canonicalId em PT, mas os arquivos .mdx usam o slug
  // (filename) como nome. Se o arquivo do canonicalId não existir, tenta o slug direto
  // como filename — espelha o que loadTutorials (listagem) já faz. Sem isso, o post
  // individual cai no fallback 'Tutorials coming soon!'.
  const candidates = [canonicalId, slug].filter(Boolean) as string[];
  for (const id of candidates) {
    const filePath = path.join(contentDir, 'tutorial', locale, `${id}.mdx`);
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      const { data, content } = matter(raw);
      return {
        slug,
        title: data.title || '',
        description: data.description || '',
        body: marked.parse(content.trim()) as string,
        order: data.order || 99,
        faq: data.faq as FAQEntry[] | undefined,
      };
    }
  }
  return null;
}

interface PageHeading {
  text: string;
  id: string;
}

interface PageContent {
  title: string;
  description: string;
  body: string;
  headings: PageHeading[];
  lastUpdated: string;
}

const VALID_PAGE_SLUGS = new Set([
  'terms', 'privacy', 'risk-disclaimer', 'responsible-gaming',
  'aml', 'dispute-resolution', 'proof-of-fairness', 'bug-bounty', 'game-rules',
  'whitepaper',
]);

export function loadPageContent(slug: string, locale: string = 'en'): PageContent | null {
  if (!VALID_PAGE_SLUGS.has(slug)) return null;
  const pageDir = path.join(contentDir, 'pages', locale);
  const filePath = path.join(pageDir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const body = marked.parse(content.trim()) as string;

  const tokens = lexer(content);
  const headings: PageHeading[] = [];
  for (const t of tokens) {
    if (t.type === 'heading' && t.depth === 2) {
      const text = 'text' in t ? (t as { text: string }).text : '';
      headings.push({ text, id: slugify(text) });
    }
  }

  const stat = fs.statSync(filePath);
  const lastUpdated = stat.mtime.toISOString().split('T')[0];

  return {
    title: data.title || slug,
    description: data.description || '',
    body,
    headings,
    lastUpdated,
  };
}

export function getAllPageSlugs(locale: string): string[] {
  const pageDir = path.join(contentDir, 'pages', locale);
  if (!fs.existsSync(pageDir)) return [];
  return fs.readdirSync(pageDir)
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace(/\.mdx$/, ''))
    .filter(slug => VALID_PAGE_SLUGS.has(slug));
}

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
  const loadFn = type === 'blog' ? loadBlogPosts : loadTutorials;
  const allPosts = loadFn(locale);
  const current = allPosts.find((p: any) => p.slug === slug);
  if (!current) return [];

  if ((current as any).related?.length) {
    return allPosts
      .filter((p: any) => (current as any).related.includes(p.slug))
      .map((p: any) => ({ title: p.title, slug: p.slug, cover: p.cover }));
  }

  return allPosts
    .filter((p: any) => p.slug !== slug)
    .map((p: any) => ({
      post: p,
      score: jaccardSimilarity(p.tags || [], (current as any).tags || []),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => ({ title: r.post.title, slug: r.post.slug, cover: r.post.cover }));
}

export type { BlogPost, FAQEntry, FAQItem, HomeSettings, PageContent, TutorialItem };
