import { Helmet } from 'react-helmet-async';

interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

const SITE_NAME = 'CryptoBingo';
const BASE_URL = 'https://www.cryptobingo.bet';
const DEFAULT_DESC = 'Bingo on-chain na WAX. Compre cartelas, ganhe prêmios em WAX e NFTs. Participe da comunidade CryptoBingo.';
const DEFAULT_OG = `${BASE_URL}/og-image.png`;

export default function Seo({ title, description, canonical, ogImage }: SeoProps) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  const desc = description ?? DEFAULT_DESC;
  const url = canonical ? `${BASE_URL}${canonical}` : BASE_URL;
  const img = ogImage ?? DEFAULT_OG;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      <link rel="canonical" href={url} />

      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:url" content={url} />
      <meta property="og:image" content={img} />
      <meta property="og:locale" content="pt_BR" />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
