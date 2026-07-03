const BASE_URL = 'https://cryptobingo.bet';

export function organizationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CryptoBingo',
    url: BASE_URL,
    logo: `${BASE_URL}/brand/icon.svg`,
    sameAs: [
      'https://t.me/cryptobingo_bet',
      'https://x.com/CryptoBingo_Bet',
      'https://discord.gg/EYYhdRWUnm',
      'https://github.com/iurineumann/cryptobingo',
    ],
  };
}

export function webApplicationSchema() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'CryptoBingo',
    url: BASE_URL,
    applicationCategory: 'GameApplication',
    operatingSystem: 'Web',
    browserRequirements: 'Requires Web3 wallet',
  };
}

export function breadcrumbSchema(items: { name: string; url: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  };
}

export function articleSchema(opts: {
  title: string;
  description: string;
  date: string;
  author: string;
  image?: string;
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: opts.title,
    description: opts.description,
    datePublished: opts.date,
    author: { '@type': 'Person', name: opts.author },
    image: opts.image ?? `${BASE_URL}/brand/og-image.svg`,
  };
}

export function faqPageSchema(questions: { question: string; answer: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(q => ({
      '@type': 'Question',
      name: q.question,
      acceptedAnswer: { '@type': 'Answer', text: q.answer },
    })),
  };
}
