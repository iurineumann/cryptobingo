import type { Config } from "@react-router/dev/config";
import fs from 'node:fs';
import path from 'node:path';

const LOCALES = ['en', 'pt', 'zh'] as const;

function loadSlugsIndex(): Record<string, Record<string, Record<string, string>>> {
  const filePath = path.resolve(process.cwd(), "content", "slugs.json");
  if (!fs.existsSync(filePath)) {
    throw new Error(
      "[react-router.config] content/slugs.json AUSENTE. O landing-page depende do " +
      "submodule content/ (cryptobingo-tina.git, slugs dinamicos ADR-040). " +
      "Sem ele, o build falha com 'Invalid route exports' no prerender.\n" +
      "Antes do build, rode: git submodule update --init --recursive\n" +
      "(Preceito: GitHub Actions BLOQUEADAS em free tier -> deploy manual)"
    );
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

const SLUGS_INDEX = loadSlugsIndex();

function getSlugsForType(type: string, locale: string): string[] {
  const entries = SLUGS_INDEX[type];
  if (!entries) return [];
  return Object.values(entries)
    .map(entry => entry[locale])
    .filter(Boolean);
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
    `/${locale}/press-kit`,
    `/${locale}/tokenomics`,
    `/${locale}/tutorials`,
    ...getSlugsForType('tutorial', locale).map(slug => `/${locale}/tutorials/${slug}`),
    ...getSlugsForType('blog', locale).map(slug => `/${locale}/blog/${slug}`),
    ...getPageSlugs(locale).map(slug => `/${locale}/${slug}`),
  ]);

  return ['/', ...localePaths];
}

export default {
  ssr: false,
  prerender: prerenderPaths(),
} satisfies Config;
