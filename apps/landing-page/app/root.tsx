import { Fragment, useEffect } from 'react';
import { HelmetProvider, Helmet } from 'react-helmet-async';
import { Links, Meta, Outlet, Scripts, ScrollRestoration, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import * as Sentry from '@sentry/react';
import '../src/i18n/config';
import '../src/styles/globals.css';

if (typeof window !== 'undefined') {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    _analyticsConsented?: boolean;
    CookieConsent?: {
      setLanguage: (lang: string) => void;
      getLanguage?: () => string;
    };
  }
}

const CONSENT_STYLES = `
.cc-flush{--cc-bg:#1a1a2e;--cc-primary-color:#e2e8f0;--cc-secondary-color:#94a3b8;--cc-btn-primary-bg:#a78bfa;--cc-btn-primary-color:#0f0f1a;--cc-btn-primary-hover-bg:#c4b5fd;--cc-btn-secondary-bg:#1e1e35;--cc-btn-secondary-color:#e2e8f0;--cc-btn-secondary-hover-bg:#2d2d4a;--cc-toggle-bg-off:#1e1e35;--cc-toggle-bg-on:#a78bfa;--cc-toggle-btn-bg:#e2e8f0;--cc-toggle-btn-bg-hover:#cbd5e1;--cc-cookie-category-block-bg:#1a1a2e;--cc-cookie-category-block-hover-bg:#1e1e35;--cc-cookie-category-block-expanded-bg:#1a1a2e;--cc-overlay-bg:rgba(0,0,0,0.7);--cc-webkit-scrollbar-bg:#1e1e35;--cc-webkit-scrollbar-bg-hover:#a78bfa}
`;

function jsonLdStructuredData(locale: string) {
  const org = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'CryptoBingo',
    url: `https://www.cryptobingo.bet/${locale}`,
    logo: 'https://www.cryptobingo.bet/favicon.svg',
    sameAs: ['https://discord.gg/cryptobingo', 'https://x.com/CryptoBingo_Bet'],
    description: 'On-chain BINGO GameFi on WAX blockchain',
  };
  const website = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    url: `https://www.cryptobingo.bet/${locale}`,
    name: 'CryptoBingo',
    inLanguage: locale,
    potentialAction: {
      '@type': 'SearchAction',
      target: `https://www.cryptobingo.bet/${locale}/ideas?q={search_term_string}`,
    },
  };
  const json = JSON.stringify([org, website], null, 2);
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}

const LOCALES = ['en', 'pt', 'zh'] as const;

function alternateLinks(pathname: string) {
  const match = pathname.match(/^\/(en|pt|zh)(\/|$)/);
  const currentLocale = match?.[1] ?? 'en';
  const rest = pathname.replace(/^\/(en|pt|zh)(\/|$)/, '/');

  return (
    <Fragment>
      {LOCALES.map((loc) => (
        <link
          key={loc}
          rel="alternate"
          hrefLang={loc}
          href={`https://www.cryptobingo.bet/${loc}${rest}`}
        />
      ))}
      <link
        rel="alternate"
        hrefLang="x-default"
        href={`https://www.cryptobingo.bet/en${rest}`}
      />
    </Fragment>
  );
}

function RouteTracker() {
  const location = useLocation();
  useEffect(() => {
    if(!window._analyticsConsented) return;
    window.dataLayer?.push({
      event: 'page_view',
      page_path: window.location.pathname,
      page_title: document.title,
    });
  }, [location]);
  return null;
}

function localeToHtmlLang(locale: string): string {
  return locale.split('-')[0];
}

function localeToOgLocale(locale: string): string {
  const map: Record<string, string> = { en: 'en_US', pt: 'pt_BR', zh: 'zh_CN' };
  return map[locale.split('-')[0]] || 'en_US';
}

function useSegmentLocale(pathname: string): string {
  const match = pathname.match(/^\/(en|pt|zh)(\/|$)/);
  return match?.[1] ?? 'en';
}

export default function Root() {
  const { i18n } = useTranslation();
  const location = useLocation();
  const urlLocale = useSegmentLocale(location.pathname);
  const currentLang = localeToHtmlLang(urlLocale);

  useEffect(() => {
    const langMap: Record<string, string> = { en: 'en-US', pt: 'pt-BR', zh: 'zh-CN' };
    const htmlLang = langMap[urlLocale] || 'en-US';
    document.documentElement.lang = htmlLang;
    if (i18n.language !== urlLocale) {
      i18n.changeLanguage(urlLocale);
    }
    // Mantém o banner de consent no idioma ativo do site (pt/en/zh)
    try {
      localStorage.setItem('cb_lang', urlLocale);
      if (typeof window.CookieConsent !== 'undefined' && window.CookieConsent.setLanguage) {
        window.CookieConsent.setLanguage(urlLocale);
      }
    } catch { /* silencioso */ }
  }, [urlLocale, i18n]);

  return (
    <HelmetProvider>
      <Helmet htmlAttributes={{ lang: currentLang }}>
        <meta property="og:locale" content={localeToOgLocale(urlLocale)} />
        <meta name="google-site-verification" content="TODO_VERIFY" />
        {alternateLinks(location.pathname)}
        {jsonLdStructuredData(urlLocale)}
      </Helmet>
      <html lang={currentLang}>
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="stylesheet" href="/static/vendor/cookieconsent.css" />
          <style dangerouslySetInnerHTML={{ __html: CONSENT_STYLES }} />
          <Meta />
          <Links />
        </head>
         <body>
          <a
            href="#main-content"
            className="sr-only focus:not-sr-only focus:fixed focus:top-4 focus:left-4 focus:z-[100] focus:bg-accent-400 focus:text-surface-900 focus:px-4 focus:py-2 focus:rounded-xl focus:text-sm focus:font-semibold focus:outline-none"
            data-testid="skip-link"
          >
            Pular para conteúdo
          </a>
          <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="a11y-live-region" />
          <noscript>
            <iframe src="/tg/ns.html?id=GTM-N88CZVJF"
              height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}>
            </iframe>
          </noscript>
          <Outlet />
          <ScrollRestoration />
          <Scripts />
          <RouteTracker />
        </body>
      </html>
    </HelmetProvider>
  );
}
