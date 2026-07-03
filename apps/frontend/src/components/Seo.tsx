import { Helmet } from 'react-helmet-async';

interface SeoProps {
  title?: string;
  description?: string;
  ogImage?: string;
  canonical?: string;
  hreflang?: string[];
  jsonLd?: Record<string, unknown>[];
}

const SITE_NAME = 'CryptoBingo';
const BASE_URL = 'https://cryptobingo.bet';
const DEFAULT_DESC = 'Bingo on-chain, provably fair na blockchain WAX. Sorteios verificáveis via oráculo, pagamento automático via smart contract.';
const DEFAULT_OG = `${BASE_URL}/brand/og-image.svg`;

function renderJsonLd(data: Record<string, unknown>[]) {
  return data.map((item, i) => (
    <script key={i} type="application/ld+json">
      {JSON.stringify(item)}
    </script>
  ));
}

export default function Seo({
  title,
  description = DEFAULT_DESC,
  ogImage = DEFAULT_OG,
  canonical,
  hreflang,
  jsonLd,
}: SeoProps) {
  const pageTitle = title ? `${title} | ${SITE_NAME}` : `${SITE_NAME} — Bingo GameFi na WAX`;
  const url = canonical ? `${BASE_URL}${canonical}` : BASE_URL;

  return (
    <Helmet>
      <title>{pageTitle}</title>
      <meta name="description" content={description} />

      <link rel="canonical" href={url} />

      <meta property="og:title" content={pageTitle} />
      <meta property="og:description" content={description} />
      <meta property="og:image" content={ogImage} />
      <meta property="og:image:width" content="1200" />
      <meta property="og:image:height" content="630" />
      <meta property="og:url" content={url} />
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={pageTitle} />
      <meta name="twitter:description" content={description} />
      <meta name="twitter:image" content={ogImage} />
      <meta name="twitter:site" content="@CryptoBingo_Bet" />

      {hreflang?.map(lang => (
        <link key={lang} rel="alternate" hrefLang={lang} href={url} />
      ))}

      {jsonLd && renderJsonLd(jsonLd)}
    </Helmet>
  );
}
