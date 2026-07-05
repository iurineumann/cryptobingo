import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';

const LOCALES = ['pt', 'en', 'zh'];
const EXISTING_SLUGS = ['rng-explicado', 'testnet-lancamento'];

function loadPost(locale: string, slug: string) {
  const p = path.resolve(process.cwd(), 'content/blog', locale, `${slug}.md`);
  return matter(fs.readFileSync(p, 'utf-8'));
}

describe.each(EXISTING_SLUGS)('frontmatter: %s', (slug) => {
  it.each(LOCALES)('has required fields in %s', (locale) => {
    const { data } = loadPost(locale, slug);
    expect(data.category).toBeDefined();
    expect(typeof data.category).toBe('string');
    expect(data.reading_time).toBeGreaterThan(0);
    expect(Array.isArray(data.related)).toBe(true);
    expect(Array.isArray(data.related_tutorials)).toBe(true);
    expect(Array.isArray(data.images)).toBe(true);
    expect(typeof data.cover).toBe('string');
  });

  it.each(LOCALES)('tags are from 18-tag taxonomy in %s', (locale) => {
    const validTags = ['wax', 'blockchain', 'gamefi', 'rng', 'security', 'economy',
      'tokenomics', 'patterns', 'strategy', 'guide', 'tutorial', 'community',
      'provably-fair', 'beginner', 'wallet', 'trust', 'nft', 'faq'];
    const { data } = loadPost(locale, slug);
    for (const tag of data.tags) {
      expect(validTags).toContain(tag);
    }
  });
});
