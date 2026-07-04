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
  }
}

const GTM_SCRIPTS = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('consent','default',{
  'analytics_storage':'denied',
  'ad_storage':'denied',
  'ad_user_data':'denied',
  'ad_personalization':'denied',
  'functionality_storage':'granted',
  'personalization_storage':'denied',
  'security_storage':'granted',
  'wait_for_update':500
});
gtag('set','ads_data_redaction',true);
gtag('set','url_passthrough',true);

(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N88CZVJF');
`;

const CONSENT_STYLES = `
.cc-flush{--cc-bg:#1a1a2e;--cc-primary-color:#e2e8f0;--cc-secondary-color:#94a3b8;--cc-btn-primary-bg:#a78bfa;--cc-btn-primary-color:#0f0f1a;--cc-btn-primary-hover-bg:#c4b5fd;--cc-btn-secondary-bg:#1e1e35;--cc-btn-secondary-color:#e2e8f0;--cc-btn-secondary-hover-bg:#2d2d4a;--cc-toggle-bg-off:#1e1e35;--cc-toggle-bg-on:#a78bfa;--cc-toggle-btn-bg:#e2e8f0;--cc-toggle-btn-bg-hover:#cbd5e1;--cc-cookie-category-block-bg:#1a1a2e;--cc-cookie-category-block-hover-bg:#1e1e35;--cc-cookie-category-block-expanded-bg:#1a1a2e;--cc-overlay-bg:rgba(0,0,0,0.7);--cc-webkit-scrollbar-bg:#1e1e35;--cc-webkit-scrollbar-bg-hover:#a78bfa}
`;

const CONSENT_SCRIPT = `
function getCats(cats){
  if(Array.isArray(cats)){
    return {
      analytics: cats.indexOf('analytics') !== -1,
      marketing: cats.indexOf('marketing') !== -1,
      ads: cats.indexOf('ads') !== -1
    };
  }
  return cats||{};
}
function updateGtag(cookie){
  if(typeof gtag==='undefined') return;
  var cats=getCats(cookie.categories);
  gtag('consent','update',{
    analytics_storage: cats.analytics?'granted':'denied',
    ad_storage: cats.ads?'granted':'denied',
    ad_user_data: cats.ads?'granted':'denied',
    ad_personalization: cats.ads?'granted':'denied',
    functionality_storage: 'granted',
    personalization_storage: cats.marketing?'granted':'denied',
    security_storage: 'granted'
  });
}
function logConsent(cookie){
  try{
    var cats=getCats(cookie.categories);
    localStorage.setItem('cb_consent',JSON.stringify({
      timestamp:new Date().toISOString(),
      categories:Object.keys(cats).filter(function(k){return cats[k];}),
      consentId:(crypto.randomUUID&&crypto.randomUUID())||Date.now().toString(36),
      version:'2026.07'
    }));
  }catch(e){}
}
function startClarity(){
  if(window.clarity) return;
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='https://www.clarity.ms/tag/'+i;
    y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
  })(window,document,'clarity','script','xge781i2so');
}
function stopClarity(){
  if(typeof clarity!=='undefined') clarity('stop');
}
function handleConsent(cookie){
  updateGtag(cookie);
  logConsent(cookie);
  var cats=getCats(cookie.categories);
  window._analyticsConsented = cats.analytics;
  cats.analytics ? startClarity() : stopClarity();
  if(cats.analytics||cats.marketing){
    window.dataLayer.push({
      event:'page_view',
      page_path:window.location.pathname,
      page_title:document.title
    });
  }
}
document.addEventListener('DOMContentLoaded',function(){
  if(typeof CookieConsent==='undefined') return;
  CookieConsent.run({
    autoclearCookies:true,
    categories:{
      necessary:{enabled:true,readOnly:true,cookies:[{name:/^cb_/},{name:/^connect\\.sess$/}]},
      analytics:{cookies:[{name:/^_ga/},{name:/^_gid/},{name:/^_cl_/},{name:/^_clsk/}]},
      marketing:{cookies:[{name:/^_gcl_/},{name:/^_fbp/}]}
    },
      language:{
        default:'en',
        autoDetect:'browser',
        translations:{
          en:{consentModal:{title:'🍪 We use cookies',description:'We use cookies to ensure the site works, analyze traffic, and with your consent, personalize your experience. See our <a href="/privacy" class="cc-link">Privacy Policy</a>.',acceptAllBtn:'Accept all',acceptNecessaryBtn:'Only necessary',showPreferencesBtn:'Customize',footer:'<a href="/privacy">Privacy Policy</a> · <a href="mailto:dpo@cryptobingo.bet">DPO</a>'},preferencesModal:{title:'Cookie Preferences',acceptAllBtn:'Accept all',acceptNecessaryBtn:'Only necessary',savePreferencesBtn:'Save preferences',closeIconLabel:'Close',sections:[{title:'Cookie Usage',description:'We use cookies to improve your experience. You can choose which categories to allow.'},{title:'Strictly Necessary',description:'Essential for basic site functionality. Cannot be disabled.',linkedCategory:'necessary'},{title:'Analytics',description:'Collect anonymous usage data to improve our services. Includes Google Analytics and Microsoft Clarity.',linkedCategory:'analytics'},{title:'Marketing',description:'Allow tracking conversions and showing relevant ads.',linkedCategory:'marketing'},{title:'Your Rights',description:'You can revoke or change your consent at any time.'}]}},
          pt:{consentModal:{title:'🍪 Usamos cookies',description:'Utilizamos cookies para garantir o funcionamento do site, analisar o tráfego e, com seu consentimento, personalizar sua experiência.',acceptAllBtn:'Aceitar todos',acceptNecessaryBtn:'Apenas necessários',showPreferencesBtn:'Personalizar',footer:'<a href="/privacy">Política de Privacidade</a> · <a href="mailto:dpo@cryptobingo.bet">DPO</a>'},preferencesModal:{title:'Central de Preferências',acceptAllBtn:'Aceitar todos',acceptNecessaryBtn:'Apenas necessários',savePreferencesBtn:'Salvar',closeIconLabel:'Fechar',sections:[{title:'Uso de Cookies',description:'Usamos cookies para melhorar sua experiência.'},{title:'Necessários',description:'Essenciais para o funcionamento do site.',linkedCategory:'necessary'},{title:'Analíticos',description:'Coletam dados anônimos de uso.',linkedCategory:'analytics'},{title:'Marketing',description:'Permitem rastrear conversões.',linkedCategory:'marketing'},{title:'Seus direitos',description:'Você pode revogar seu consentimento a qualquer momento.'}]}}
        }
      },
    guiOptions:{consentModal:{layout:'cloud',position:'bottom center',equalWeightButtons:true,flipButtons:false},preferencesModal:{layout:'box',equalWeightButtons:true,flipButtons:false}},
    onFirstConsent:function({cookie}){handleConsent(cookie);},
    onConsent:function({cookie}){handleConsent(cookie);},
    onChange:function({cookie}){handleConsent(cookie);}
  });
});
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
          hreflang={loc}
          href={`https://www.cryptobingo.bet/${loc}${rest}`}
        />
      ))}
      <link
        rel="alternate"
        hreflang="x-default"
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
          <script dangerouslySetInnerHTML={{ __html: GTM_SCRIPTS }} />
          <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vanilla-cookieconsent@3/dist/cookieconsent.css" />
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
            <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-N88CZVJF"
              height="0" width="0" style={{ display: 'none', visibility: 'hidden' }}>
            </iframe>
          </noscript>
          <Outlet />
          <ScrollRestoration />
          <Scripts />
          <script defer src="https://cdn.jsdelivr.net/npm/vanilla-cookieconsent@3/dist/cookieconsent.umd.js" />
          <script dangerouslySetInnerHTML={{ __html: CONSENT_SCRIPT }} />
          <RouteTracker />
        </body>
      </html>
    </HelmetProvider>
  );
}
