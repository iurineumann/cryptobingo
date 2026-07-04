import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const LOCALES = ['en', 'pt', 'zh'];
const BASE_URL = 'https://www.cryptobingo.bet';
const OUT_DIR = process.env.OUT_DIR || path.resolve(ROOT, 'build', 'client');

const ROUTES = [
  { route: '', priority: 1.0, changefreq: 'weekly' },
  { route: 'faq', priority: 0.7, changefreq: 'weekly' },
  { route: 'blog', priority: 0.7, changefreq: 'weekly' },
  { route: 'ideas', priority: 0.5, changefreq: 'monthly' },
  { route: 'whitepaper', priority: 0.8, changefreq: 'monthly' },
  { route: 'press-kit', priority: 0.5, changefreq: 'monthly' },
  { route: 'tokenomics', priority: 0.8, changefreq: 'monthly' },
  { route: 'tutorials', priority: 0.5, changefreq: 'monthly' },
  { route: 'privacy', priority: 0.4, changefreq: 'monthly' },
  { route: 'terms', priority: 0.4, changefreq: 'monthly' },
  { route: 'risk-disclaimer', priority: 0.3, changefreq: 'yearly' },
  { route: 'responsible-gaming', priority: 0.3, changefreq: 'yearly' },
  { route: 'game-rules', priority: 0.5, changefreq: 'monthly' },
  { route: 'aml', priority: 0.3, changefreq: 'yearly' },
  { route: 'proof-of-fairness', priority: 0.5, changefreq: 'monthly' },
  { route: 'dispute-resolution', priority: 0.3, changefreq: 'yearly' },
  { route: 'bug-bounty', priority: 0.4, changefreq: 'monthly' },
];

function getBlogSlugs(locale) {
  const blogDir = path.resolve(ROOT, 'content', 'blog', locale);
  if (!fs.existsSync(blogDir)) return [];
  return fs.readdirSync(blogDir)
    .filter(f => f.endsWith('.md'))
    .map(f => f.replace(/\.md$/, ''));
}

function buildUrl(locale, route) {
  const p = route ? `/${route}` : '';
  return `${BASE_URL}/${locale}${p}`;
}

function xhtmlLink(locale, route) {
  const href = buildUrl(locale, route);
  return `      <xhtml:link rel="alternate" hreflang="${locale}" href="${href}" />`;
}

function urlEntry(locale, route, priority, changefreq) {
  const loc = buildUrl(locale, route);
  const links = LOCALES.map(l => xhtmlLink(l, route)).join('\n');
  const xDefault = buildUrl('en', route);
  return `  <url>
    <loc>${loc}</loc>
${links}
      <xhtml:link rel="alternate" hreflang="x-default" href="${xDefault}" />
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>
  </url>`;
}

function generate() {
  const entries = [];

  for (const { route, priority, changefreq } of ROUTES) {
    for (const locale of LOCALES) {
      entries.push(urlEntry(locale, route, priority, changefreq));
    }
  }

  for (const locale of LOCALES) {
    const slugs = getBlogSlugs(locale);
    for (const slug of slugs) {
      entries.push(urlEntry(locale, `blog/${slug}`, 0.6, 'monthly'));
    }
  }

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset
  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
  xmlns:xhtml="http://www.w3.org/1999/xhtml"
>
${entries.join('\n')}
</urlset>`;

  if (!fs.existsSync(OUT_DIR)) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
  }

  const outPath = path.resolve(OUT_DIR, 'sitemap.xml');
  fs.writeFileSync(outPath, sitemap, 'utf-8');
  console.log(`Sitemap generated: ${outPath} — ${entries.length} URLs`);
}

generate();
