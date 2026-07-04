import type { Config } from "@react-router/dev/config";
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['en', 'pt', 'zh'] as const;

function getBlogSlugs(locale: string): string[] {
  const blogDir = path.resolve(process.cwd(), "content", "blog", locale);
  if (!fs.existsSync(blogDir)) return [];
  return fs.readdirSync(blogDir)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(/\.md$/, ""));
}

function getFAQSlugs(locale: string): string[] {
  const faqDir = path.resolve(process.cwd(), "content", "faq", locale);
  if (!fs.existsSync(faqDir)) return [];
  return fs.readdirSync(faqDir)
    .filter(f => f.endsWith(".md"))
    .map(f => f.replace(/\.md$/, ""));
}

function getPageSlugs(locale: string): string[] {
  const pageDir = path.resolve(process.cwd(), "content", "pages", locale);
  if (!fs.existsSync(pageDir)) return [];
  return fs.readdirSync(pageDir)
    .filter(f => f.endsWith(".mdx"))
    .map(f => f.replace(/\.mdx$/, ""));
}

function prerenderPaths(): string[] {
  const localePaths = LOCALES.flatMap(locale => [
    `/${locale}`,
    `/${locale}/faq`,
    `/${locale}/blog`,
    `/${locale}/ideas`,
    `/${locale}/admin`,
    ...getBlogSlugs(locale).map(slug => `/${locale}/blog/${slug}`),
    ...getPageSlugs(locale).map(slug => `/${locale}/${slug}`),
  ]);

  return ['/', ...localePaths];
}

export default {
  ssr: false,
  prerender: prerenderPaths(),
} satisfies Config;
