import { describe, it, expect } from 'vitest';
import {
  getCanonicalId,
  getLocalizedSlug,
  loadBlogPosts,
  loadBlogPost,
  loadTutorials,
  loadTutorialPost,
} from '../content';

const LOCALES = ['pt', 'en', 'zh'] as const;

const KNOWN_BLOG_SLUGS: Record<string, string[]> = {
  'pt': ['o-que-e-blockchain', 'carteiras-crypto', 'wax-blockchain'],
  'en': ['what-is-blockchain', 'crypto-wallets', 'wax-blockchain-beginners'],
  'zh': ['o-que-e-blockchain', 'carteiras-crypto', 'wax-blockchain'],
};

const KNOWN_TUTORIAL_SLUGS: Record<string, string[]> = {
  'pt': ['criar-carteira-wax', 'comprar-tickets'],
  'en': ['create-wax-wallet', 'buy-tickets'],
  'zh': ['criar-carteira-wax', 'comprar-tickets'],
};

describe('getCanonicalId', () => {
  it.each([
    ['en', 'wax-blockchain-beginners', 'wax-blockchain'],
    ['pt', 'wax-blockchain', 'wax-blockchain'],
    ['zh', 'wax-blockchain', 'wax-blockchain'],
  ])('finds canonical ID in %s for slug %s', (locale, slug, expected) => {
    const id = getCanonicalId('blog', slug, locale);
    expect(id).toBe(expected);
  });

  it.each([
    ['en', 'create-wax-wallet', 'criar-carteira-wax'],
    ['pt', 'criar-carteira-wax', 'criar-carteira-wax'],
    ['zh', 'criar-carteira-wax', 'criar-carteira-wax'],
  ])('finds canonical ID for tutorial slug %s in %s', (locale, slug, expected) => {
    const id = getCanonicalId('tutorial', slug, locale);
    expect(id).toBe(expected);
  });

  it('returns null for unknown slug', () => {
    expect(getCanonicalId('blog', 'nao-existe', 'pt')).toBeNull();
  });

  it('returns null for unknown type', () => {
    expect(getCanonicalId('unknown' as any, 'slug', 'pt')).toBeNull();
  });
});

describe('getLocalizedSlug', () => {
  it.each([
    ['pt', 'wax-blockchain', 'wax-blockchain'],
    ['en', 'wax-blockchain', 'wax-blockchain-beginners'],
    ['zh', 'wax-blockchain', 'wax-blockchain'],
  ])('returns slug for blog post in %s', (locale, canonical, expected) => {
    const slug = getLocalizedSlug('blog', canonical, locale);
    expect(slug).toBe(expected);
  });

  it.each([
    ['pt', 'criar-carteira-wax', 'criar-carteira-wax'],
    ['en', 'criar-carteira-wax', 'create-wax-wallet'],
    ['zh', 'criar-carteira-wax', 'criar-carteira-wax'],
  ])('returns slug for tutorial in %s', (locale, canonical, expected) => {
    const slug = getLocalizedSlug('tutorial', canonical, locale);
    expect(slug).toBe(expected);
  });

  it('returns null for unknown canonical ID', () => {
    expect(getLocalizedSlug('blog', 'nao-existe', 'pt')).toBeNull();
  });
});

describe('loadBlogPosts slugs', () => {
  it.each(LOCALES)('uses slugs from index in %s', (locale) => {
    const posts = loadBlogPosts(locale);
    const slugs = KNOWN_BLOG_SLUGS[locale];
    for (const slug of slugs) {
      const post = posts.find(p => p.slug === slug);
      expect(post).toBeDefined();
    }
  });

  it('returns empty array for missing locale', () => {
    const posts = loadBlogPosts('xx' as any);
    expect(posts).toEqual([]);
  });
});

describe('loadBlogPost slugs', () => {
  it.each(LOCALES)('loads post by slug in %s', (locale) => {
    const slugs = KNOWN_BLOG_SLUGS[locale];
    for (const slug of slugs) {
      const post = loadBlogPost(slug, locale);
      expect(post).not.toBeNull();
      expect(post!.slug).toBe(slug);
    }
  });

  it('returns null for unknown slug', () => {
    expect(loadBlogPost('nao-existe', 'pt')).toBeNull();
  });
});

describe('loadTutorials slugs', () => {
  it.each(LOCALES)('uses slugs from index in %s', (locale) => {
    const tuts = loadTutorials(locale);
    const slugs = KNOWN_TUTORIAL_SLUGS[locale];
    for (const slug of slugs) {
      const tut = tuts.find(t => t.slug === slug);
      expect(tut).toBeDefined();
    }
  });
});

describe('loadTutorialPost slugs', () => {
  it.each(LOCALES)('loads tutorial by slug in %s', (locale) => {
    const slugs = KNOWN_TUTORIAL_SLUGS[locale];
    for (const slug of slugs) {
      const tut = loadTutorialPost(slug, locale);
      expect(tut).not.toBeNull();
      expect(tut!.slug).toBe(slug);
    }
  });

  it('returns null for unknown slug', () => {
    expect(loadTutorialPost('nao-existe', 'pt')).toBeNull();
  });
});
