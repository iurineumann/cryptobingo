/* eslint-disable */
/**
 * Injetor de scripts de terceiros (GTM, CookieConsent) que NÃO participam
 * da árvore React — evita erro de hidratação (#418) no React Router v7.
 *
 * Scripts injetados via document.createElement em entry.client.tsx,
 * fora do JSX do Root. O reconciler do React não os vê → zero #418.
 */

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
'/tg/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','GTM-N88CZVJF');
`;

/**
 * Helpers globais (getCats, updateGtag, logConsent, handleConsent,
 * startClarity, stopClarity) — referenciados nos callbacks do
 * CookieConsent.run (onFirstConsent/onConsent/onChange).
 */
const CONSENT_HELPERS = `
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
    var lang=(window.CookieConsent&&window.CookieConsent.getLanguage&&window.CookieConsent.getLanguage())||'pt';
    localStorage.setItem('cb_consent',JSON.stringify({
      timestamp:new Date().toISOString(),
      categories:Object.keys(cats).filter(function(k){return cats[k];}),
      consentId:(crypto.randomUUID&&crypto.randomUUID())||Date.now().toString(36),
      version:'2026.07'
    }));
    localStorage.setItem('cb_lang',lang);
    document.cookie='cb_consent=1; Path=/; Max-Age=34214400; SameSite=Lax';
  }catch(e){}
}
function startClarity(){
  if(window.clarity) return;
  (function(c,l,a,r,i,t,y){
    c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
    t=l.createElement(r);t.async=1;t.src='/cl/tag/'+i;
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
  if(cats.analytics && typeof clarity==='function'){
    clarity('consentv2',{
      analytics_Storage: cats.analytics?'granted':'denied',
      ad_Storage: cats.ads?'granted':'denied'
    });
  }
  if(cats.analytics||cats.marketing){
    window.dataLayer.push({
      event:'page_view',
      page_path:window.location.pathname,
      page_title:document.title
    });
  }
}
`;

/** CookieConsent.run(...) — disparado no onload do UMD, sem DOMContentLoaded. */
const CONSENT_INIT = `
CookieConsent.run({
  autoclearCookies:true,
  categories:{
    necessary:{enabled:true,readOnly:true,cookies:[{name:/^cb_/},{name:/^connect\\.sess$/}]},
    analytics:{cookies:[{name:/^_ga/},{name:/^_gid/},{name:/^_cl_/},{name:/^_clsk/}]},
    marketing:{cookies:[{name:/^_gcl_/},{name:/^_fbp/}]}
  },
  language:{
    default:'en',
    current:(function(){try{return localStorage.getItem('cb_lang')||'pt';}catch(e){return 'pt';}})()
  ,
    translations:{
        en:{consentModal:{title:'🍪 We use cookies',description:'We use cookies to ensure the site works, analyze traffic, and with your consent, personalize your experience. See our <a href="/privacy" class="cc-link">Privacy Policy</a>.',acceptAllBtn:'Accept all',acceptNecessaryBtn:'Only necessary',showPreferencesBtn:'Customize',footer:'<a href="/privacy">Privacy Policy</a> · <a href="mailto:dpo@cryptobingo.bet">DPO</a>'},preferencesModal:{title:'Cookie Preferences',acceptAllBtn:'Accept all',acceptNecessaryBtn:'Only necessary',savePreferencesBtn:'Save preferences',closeIconLabel:'Close',sections:[{title:'Cookie Usage',description:'We use cookies to improve your experience. You can choose which categories to allow.'},{title:'Strictly Necessary',description:'Essential for basic site functionality. Cannot be disabled.',linkedCategory:'necessary'},{title:'Analytics',description:'Collect anonymous usage data to improve our services. Includes Google Analytics and Microsoft Clarity.',linkedCategory:'analytics'},{title:'Marketing',description:'Allow tracking conversions and showing relevant ads.',linkedCategory:'marketing'},{title:'Your Rights',description:'You can revoke or change your consent at any time.'}]}},
        pt:{consentModal:{title:'🍪 Usamos cookies',description:'Utilizamos cookies para garantir o funcionamento do site, analisar o tráfego e, com seu consentimento, personalizar sua experiência.',acceptAllBtn:'Aceitar todos',acceptNecessaryBtn:'Apenas necessários',showPreferencesBtn:'Personalizar',footer:'<a href="/privacy">Política de Privacidade</a> · <a href="mailto:dpo@cryptobingo.bet">DPO</a>'},preferencesModal:{title:'Central de Preferências',acceptAllBtn:'Aceitar todos',acceptNecessaryBtn:'Apenas necessários',savePreferencesBtn:'Salvar',closeIconLabel:'Fechar',sections:[{title:'Uso de Cookies',description:'Usamos cookies para melhorar sua experiência.'},{title:'Necessários',description:'Essenciais para o funcionamento do site.',linkedCategory:'necessary'},{title:'Analíticos',description:'Coletam dados anônimos de uso.',linkedCategory:'analytics'},{title:'Marketing',description:'Permitem rastrear conversões.',linkedCategory:'marketing'},{title:'Seus direitos',description:'Você pode revogar seu consentimento a qualquer momento.'}]}}
      },
        zh:{consentModal:{title:'🍪 我们使用 Cookie',description:'我们使用 Cookie 来确保网站功能、分析流量，并在您同意的情况下个性化您的体验。请参阅我们的<a href="/privacy" class="cc-link">隐私政策</a>。',acceptAllBtn:'接受全部',acceptNecessaryBtn:'仅必要',showPreferencesBtn:'自定义',footer:'<a href="/privacy">隐私政策</a> · <a href="mailto:dpo@cryptobingo.bet">数据保护官</a>'},preferencesModal:{title:'Cookie 偏好设置',acceptAllBtn:'接受全部',acceptNecessaryBtn:'仅必要',savePreferencesBtn:'保存偏好',closeIconLabel:'关闭',sections:[{title:'Cookie 使用说明',description:'我们使用 Cookie 来改善您的体验。选择您允许的类别。',linkedCategory:'necessary'},{title:'严格必要',description:'网站基本功能所必需。无法禁用。',linkedCategory:'necessary'},{title:'分析',description:'收集匿名使用数据以改进我们的服务。包括 Google Analytics 和 Microsoft Clarity。',linkedCategory:'analytics'},{title:'营销',description:'跟踪转化并展示相关广告。仅在您明确同意后使用。',linkedCategory:'marketing'},{title:'您的权利',description:'您可随时撤销或更改同意。'}]}}
  },
  guiOptions:{consentModal:{layout:'cloud',position:'bottom center',equalWeightButtons:true,flipButtons:false},preferencesModal:{layout:'box',equalWeightButtons:true,flipButtons:false}},
  onFirstConsent:function({cookie}){handleConsent(cookie);},
  onConsent:function({cookie}){handleConsent(cookie);},
  onChange:function({cookie}){handleConsent(cookie);}
});
`;

export function injectGTM(): void {
  const script = document.createElement('script');
  script.textContent = GTM_SCRIPTS;
  document.head.appendChild(script);
}

export function injectCookieConsent(): void {
  // Helpers globais (referenciados nos callbacks do CookieConsent.run)
  const helpersScript = document.createElement('script');
  helpersScript.textContent = CONSENT_HELPERS;
  document.head.appendChild(helpersScript);

  // UMD do CookieConsent — ao carregar, dispara CookieConsent.run
  const umdScript = document.createElement('script');
  umdScript.src = '/static/vendor/cookieconsent.umd.js';
  umdScript.onload = () => {
    const initScript = document.createElement('script');
    initScript.textContent = CONSENT_INIT;
    document.body.appendChild(initScript);
  };
  document.body.appendChild(umdScript);
}
