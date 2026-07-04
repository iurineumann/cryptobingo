import { Helmet } from 'react-helmet-async';
import { useTranslation } from 'react-i18next';

interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  ogImage?: string;
}

const SITE_NAME = 'CryptoBingo';
const BASE_URL = 'https://www.cryptobingo.bet';
const DEFAULT_OG = `${BASE_URL}/og-image.png`;

function localeToOgLocale(locale: string): string {
  const map: Record<string, string> = { en: 'en_US', pt: 'pt_BR', zh: 'zh_CN' };
  return map[locale.split('-')[0]] || 'en_US';
}

export default function Seo({ title, description, canonical, ogImage }: SeoProps) {
  const { i18n } = useTranslation();
  const currentLang = i18n.language.split('-')[0];
  const fullTitle = `${title} | ${SITE_NAME}`;
  const desc = description;
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
      <meta property="og:locale" content={localeToOgLocale(i18n.language)} />

      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  );
}
