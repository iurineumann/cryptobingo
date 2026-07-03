import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../public/sitemap.xml');

const BASE = 'https://test.cryptobingo.bet';

const STATIC_PAGES = [
  { path: '/',                   priority: '1.0', changefreq: 'weekly' },
  { path: '/how-it-works',       priority: '0.8', changefreq: 'monthly' },
  { path: '/sponsors',           priority: '0.6', changefreq: 'monthly' },
  { path: '/tutorials',          priority: '0.7', changefreq: 'monthly' },
  { path: '/faq',                priority: '0.8', changefreq: 'weekly' },
  { path: '/news',               priority: '0.7', changefreq: 'daily' },
  { path: '/leaderboard',        priority: '0.5', changefreq: 'daily' },
  { path: '/privacy',            priority: '0.3', changefreq: 'yearly' },
];

const today = new Date().toISOString().split('T')[0];

const urls = STATIC_PAGES.map(
  p => `  <url>
    <loc>${BASE}${p.path}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
).join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;

writeFileSync(OUT, xml, 'utf-8');
console.log(`sitemap.xml generated at ${OUT} — ${STATIC_PAGES.length} URLs`);
