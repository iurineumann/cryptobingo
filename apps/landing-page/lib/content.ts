import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';

const contentDir = path.resolve(process.cwd(), 'content');

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
    return {
      slug: file.replace(/\.md$/, ''),
      title: data.title || '',
      description: data.description || '',
      date: data.date || '',
      author: data.author || '',
      cover: data.cover || '',
      tags: data.tags || [],
      body: content.trim(),
    } satisfies BlogPost;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
}

export function loadBlogPost(slug: string, locale: string = 'pt'): BlogPost | null {
  const posts = loadBlogPosts(locale);
  return posts.find(p => p.slug === slug) || null;
}

interface PageContent {
  title: string;
  description: string;
  body: string;
}

const VALID_PAGE_SLUGS = new Set([
  'terms', 'privacy', 'risk-disclaimer', 'responsible-gaming',
  'aml', 'dispute-resolution', 'proof-of-fairness', 'bug-bounty', 'game-rules',
]);

export function loadPageContent(slug: string, locale: string = 'en'): PageContent | null {
  if (!VALID_PAGE_SLUGS.has(slug)) return null;
  const pageDir = path.join(contentDir, 'pages', locale);
  const filePath = path.join(pageDir, `${slug}.mdx`);
  if (!fs.existsSync(filePath)) return null;

  const raw = fs.readFileSync(filePath, 'utf-8');
  const { data, content } = matter(raw);
  const body = marked.parse(content.trim());
  return {
    title: data.title || slug,
    description: data.description || '',
    body,
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

export type { BlogPost, FAQItem, HomeSettings, PageContent };
