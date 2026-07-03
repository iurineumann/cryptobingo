# Consentimento LGPD + GA4 + GTM em SPA React

## Problema

GA4 Real-time mostrava 0 eventos mesmo com hits `HTTP 204` saindo do navegador.

## Causas Raiz

### 1. Três bugs no consent handling (cookieconsent v3)

| Bug | Sintoma | Fix |
|-----|---------|-----|
| `onConsent: handleConsent` sem destructuring | `cookie.categories` = undefined | `onConsent: function({cookie}){ handleConsent(cookie); }` |
| `getCats` esperava objeto `{analytics: true}`, mas CCv3 retorna array `['necessary','analytics']` | `cats.analytics` sempre undefined → `denied` | Adicionar branch `Array.isArray(cats)` com `indexOf` |
| Dois defaults conflitantes no dataLayer (EU denied + global granted) | GTM ignorava global default e ia pra `denied` | Usar **único default global `denied`** sem `region` |

### 2. Browser Tracking Prevention (Microsoft Edge)

Edge bloqueia `google-analytics.com/g/collect` com `ERR_BLOCKED_BY_CLIENT`. **Isso impede qualquer hit de chegar ao GA4**, independente de consentimento.

### 3. `dataLayer.push` vs `gtag()` para consent defaults

`window.dataLayer.push(['consent','default',...])` não é processado confiavelmente pelo GTM durante startup. Use `gtag('consent','default',...)` com a função shim.

---

## Arquitetura Correta

```
index.html
  ├── dataLayer = []
  ├── gtag() shim (dataLayer.push(arguments))
  ├── gtag('consent','default',{analytics_storage:'denied',...})   ← ÚNICO default global
  ├── gtag('set', ...)
  ├── GTM snippet (dataLayer já populado)
  └── CookieConsent init (DOMContentLoaded)
        ├── onConsent → handleConsent → gtag('consent','update',...)
        ├── onChange  → handleConsent → gtag('consent','update',...)
        └── onFirstConsent → handleConsent → gtag('consent','update',...)
```

### Regras de Ouro

1. **SEMPRE** usar `function gtag(){dataLayer.push(arguments);}` (Arguments object puro, **nunca** `Array.prototype.slice.call()`)
2. **NUNCA** usar `dataLayer.push(['consent','default',...])` direto — sempre via `gtag('consent','default',...)`
3. **ÚNICO** default global `denied` — sem `region`, sem segundo default `granted`
4. `wait_for_update: 500` dá tempo pro plugin carregar antes de hits irem pro GA4
5. `send_page_view: false` — SPA gerencia page_view manualmente via React Router
6. Callbacks do CookieConsent SEMPRE destruturam `{cookie}` → `handleConsent(cookie)`

---

## Código Final

### index.html — Consent defaults + GTM + CookieConsent

Ordem exata no `<head>`:

```html
<!-- 1. dataLayer + gtag shim + consent default (ANTES do GTM) -->
<script>
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
</script>

<!-- 2. GTM snippet -->
<script>
  (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
  new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
  j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
  'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
  })(window,document,'script','dataLayer','GTM-XXXXXXX');
</script>

<!-- 3. CookieConsent init (DOMContentLoaded) -->
<script defer src="https://cdn.jsdelivr.net/npm/vanilla-cookieconsent@3/dist/cookieconsent.umd.js"></script>
<script>
document.addEventListener('DOMContentLoaded',function(){

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
    var cats=getCats(cookie.categories);
    gtag('consent','update',{
      'analytics_storage': cats.analytics?'granted':'denied',
      'ad_storage': cats.ads?'granted':'denied',
      'ad_user_data': cats.ads?'granted':'denied',
      'ad_personalization': cats.ads?'granted':'denied',
      'functionality_storage': 'granted',
      'personalization_storage': cats.marketing?'granted':'denied',
      'security_storage': 'granted'
    });
  }

  function handleConsent(cookie){
    updateGtag(cookie);
    var cats=getCats(cookie.categories);
    window._analyticsConsented = cats.analytics;
    // iniciar/parar Clarity conforme consentimento
    cats.analytics ? startClarity() : stopClarity();
  }

  CookieConsent.run({
    // ...
    // callbacks DEVEM destruturar:
    onConsent: function({cookie}){ handleConsent(cookie); },
    onChange: function({cookie}){ handleConsent(cookie); },
    onFirstConsent: function({cookie}){ handleConsent(cookie); }
  });
});
</script>
```

### GTM Container (web interface)

| Config | Valor |
|--------|-------|
| Google Tag | `send_page_view=false` (desligado) |
| GA4 Event Tag | Trigger: `page_view` custom event |
| Consent Overview | **NÃO** configurar consent defaults no GTM (já vão via dataLayer) |

### React Hook — page_view manual

```ts
useEffect(() => {
  if (window.gtag) {
    window.gtag('event', 'page_view', {
      page_path: location.pathname + location.search,
      page_title: document.title
    });
  }
}, [location]);
```

---

## Verificação

1. Abrir aba anônima, abrir console
2. Digitar `dataLayer` — deve ter evento `consent` com `analytics_storage:'denied'`
3. Clicar "Aceitar todos" no banner
4. Digitar `dataLayer` — novo evento `consent` com `update` e `analytics_storage:'granted'`
5. Network tab: hits `g/collect` com `gcs=G1XX` (granted)

### Debug de `gcs` no hit URL

| gcs | Significado |
|-----|-------------|
| `G100` | analytics=denied, ad=denied |
| `G110` | analytics=granted, ad=denied |
| `G111` | ambos granted |
| `G1XX` | geralmente correto pós-consent |

---

## Problemas Conhecidos

### Browser Tracking Prevention
Edge/Chrome podem bloquear `google-analytics.com/g/collect`. Soluções:
- Proxy server-side (já implementado em `useAnalytics.ts`)
- Instruir usuário a desabilitar tracking prevention ou usar navegador sem bloqueio

### Container Quality Warning (GA4)
Se remover `region:['EU']` e não atualizar consent via update suficiente, GA4 mostra "0% consent rate in non-EEA". É esperado — resolvido quando usuários aceitam cookies.

### SWA Deploy via CLI
`npx @azure/static-web-apps-cli deploy` pode travar. Alternativas:
- `az staticwebapp secrets list` → token → curl upload
- GitHub Actions (push na branch develop/production)
- npm run build local + zip + upload manual pelo portal Azure

---

## Histórico

2026-07-03: Investigação completa. Causa: consent defaults e browser tracking prevention.
