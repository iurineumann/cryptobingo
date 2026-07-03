import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';

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
  hero: { title: string; subtitle: string; cta_text: string; cta_link: string };
  features: Array<{ title: string; description: string; icon: string }>;
  social: { telegram: string; discord: string; twitter: string; github: string };
}

export function loadSettings(): HomeSettings {
  const filePath = path.join(contentDir, 'settings', 'home.json');
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw);
}

export function loadFAQItems(): FAQItem[] {
  const faqDir = path.join(contentDir, 'faq');
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

export function loadBlogPosts(): BlogPost[] {
  const blogDir = path.join(contentDir, 'blog');
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

export function loadBlogPost(slug: string): BlogPost | null {
  const posts = loadBlogPosts();
  return posts.find(p => p.slug === slug) || null;
}

export type { BlogPost, FAQItem, HomeSettings };
