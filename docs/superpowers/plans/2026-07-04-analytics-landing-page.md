# Analytics Landing Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar eventos custom de tracking (GA4 via GTM) na landing page para monitorar conversao, engajamento e funil de aquisicao.

**Architecture:** `services/analytics.ts` com `trackEvent()` que chama `dataLayer.push`. Hook `useAnalytics` expoe `trackEvent` pra componentes. Componentes chamam `trackEvent` em onClick/onSubmit. Sem fallback proxy, sem alteracao no setup existente de GTM/CCv3.

**Tech Stack:** TypeScript, React Router v7 (SSG), GTM/GA4, vitest

## Global Constraints
- Nao modificar `index.html`, `app/root.tsx` (GTM/CCv3 setup intocado)
- Nao usar fallback proxy GA4 MP
- `trackEvent` so chama `dataLayer.push`, nunca `gtag` diretamente
- i18n: usar locale ja disponivel no hook/componente
- Nomes de eventos em ingles (padrao GA4)
- Seguir padrao do projeto: sem comentarios em codigo

---

### Task 1: Criar services/analytics.ts + testes

**Files:**
- Create: `apps/landing-page/src/services/analytics.ts`
- Create: `apps/landing-page/src/services/__tests__/analytics.test.ts`
- Modify: `apps/landing-page/src/services/__tests__/tsconfig.json` (se necessario)

**Interfaces:**
- Consumes: `window.dataLayer`, `window._analyticsConsented`
- Produces: `trackEvent(name: string, params?: Record<string, unknown>): void`

- [ ] **Step 1: Write the failing test**

```ts
// apps/landing-page/src/services/__tests__/analytics.test.ts
import { trackEvent } from '../analytics';

beforeEach(() => {
  delete (window as any).dataLayer;
  delete (window as any)._analyticsConsented;
});

describe('trackEvent', () => {
  it('should push event to dataLayer when consentimento granted', () => {
    window.dataLayer = [];
    window._analyticsConsented = true;
    trackEvent('cta_click', { cta_location: 'hero', locale: 'pt' });
    expect(window.dataLayer).toHaveLength(1);
    expect(window.dataLayer[0]).toMatchObject({
      event: 'cta_click',
      cta_location: 'hero',
      locale: 'pt',
    });
  });

  it('should not push when consentimento not granted', () => {
    window.dataLayer = [];
    window._analyticsConsented = false;
    trackEvent('cta_click', { cta_location: 'hero' });
    expect(window.dataLayer).toHaveLength(0);
  });

  it('should not push when dataLayer undefined', () => {
    trackEvent('cta_click', { cta_location: 'hero' });
    expect(() => trackEvent('cta_click', {})).not.toThrow();
  });

  it('should not throw when params is empty', () => {
    window.dataLayer = [];
    window._analyticsConsented = true;
    expect(() => trackEvent('test_event')).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/landing-page/src/services/__tests__/analytics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/landing-page/src/services/analytics.ts
declare global {
  interface Window {
    dataLayer?: unknown[];
    _analyticsConsented?: boolean;
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!window._analyticsConsented || !window.dataLayer) return;
  window.dataLayer.push({ event: name, ...params });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/landing-page/src/services/__tests__/analytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/services/analytics.ts apps/landing-page/src/services/__tests__/analytics.test.ts
git commit -m "feat(analytics): services/analytics.ts com trackEvent + testes"
```

---

### Task 2: Criar hook useAnalytics

**Files:**
- Create: `apps/landing-page/src/hooks/useAnalytics.ts`
- Create: `apps/landing-page/src/hooks/__tests__/useAnalytics.test.ts`

**Interfaces:**
- Consumes: `trackEvent` de `services/analytics.ts`, `useTranslation` locale
- Produces: `useAnalytics(): { trackEvent(name: string, params?: Record<string, unknown>): void }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/landing-page/src/hooks/__tests__/useAnalytics.test.ts
import { renderHook } from '@testing-library/react';
import { useAnalytics } from '../useAnalytics';

beforeEach(() => {
  (window as any).dataLayer = [];
  (window as any)._analyticsConsented = true;
});

it('should return trackEvent function', () => {
  const { result } = renderHook(() => useAnalytics());
  expect(typeof result.current.trackEvent).toBe('function');
});

it('should enrich evento with locale', () => {
  const { result } = renderHook(() => useAnalytics('en'));
  result.current.trackEvent('cta_click', { cta_location: 'hero' });
  expect(window.dataLayer[0]).toMatchObject({
    event: 'cta_click',
    cta_location: 'hero',
    locale: 'en',
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/landing-page/src/hooks/__tests__/useAnalytics.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/landing-page/src/hooks/useAnalytics.ts
import { trackEvent as track } from '../services/analytics';

export function useAnalytics(locale?: string) {
  const trackEvent = (name: string, params?: Record<string, unknown>) => {
    track(name, { ...params, locale: locale || 'en' });
  };
  return { trackEvent };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/landing-page/src/hooks/__tests__/useAnalytics.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/hooks/useAnalytics.ts apps/landing-page/src/hooks/__tests__/useAnalytics.test.ts
git commit -m "feat(analytics): hook useAnalytics com locale enrichment"
```

---

### Task 3: Integrar Hero.tsx — cta_click

**Files:**
- Modify: `apps/landing-page/src/components/Hero.tsx`

- [ ] **Step 1: Read Hero.tsx to understand current structure**

- [ ] **Step 2: Write the failing test**

```ts
// apps/landing-page/src/components/__tests__/Hero.test.ts ou junto existente
it('should push cta_click when CTA clicked', () => {
  render(<Hero />);
  fireEvent.click(screen.getByTestId('hero-cta'));
  expect(window.dataLayer).toContainEqual(
    expect.objectContaining({ event: 'cta_click', cta_location: 'hero' })
  );
});
```

- [ ] **Step 3: Add trackEvent to Hero onClick**

```tsx
// dentro do componente Hero
const { trackEvent } = useAnalytics(locale);

// no CTA button
onClick={() => trackEvent('cta_click', { cta_location: 'hero' })}

// no "learn more" / secondary CTA
onClick={() => trackEvent('cta_click', { cta_location: 'hero_learn' })}
```

- [ ] **Step 4: Run tests to verify**

- [ ] **Step 5: Commit**

```bash
git add apps/landing-page/src/components/Hero.tsx
git commit -m "feat(analytics): cta_click no Hero"
```

---

### Task 4: Integrar Header.tsx — cta_click + nav_click + locale_switch

**Files:**
- Modify: `apps/landing-page/src/components/Header.tsx`

- [ ] **Step 1: Create test file**

- [ ] **Step 2: Add trackEvent to:**
  - CTA button: `cta_click` com `cta_location: header|drawer`
  - Nav links: `nav_click` com `link_text`, `link_href`, `link_type`
  - Lang switcher: `locale_switch` com `from_locale`, `to_locale`

- [ ] **Step 3: Run tests to verify**

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/components/Header.tsx
git commit -m "feat(analytics): cta_click + nav_click + locale_switch no Header"
```

---

### Task 5: Integrar Newsletter.tsx — newsletter_subscribe + error

**Files:**
- Modify: `apps/landing-page/src/components/Newsletter.tsx`

- [ ] **Step 1: Read Newsletter.tsx to understand handleSubmit flow**

- [ ] **Step 2: Add trackEvent on submit success and error**

```tsx
// apos submit OK
trackEvent('newsletter_subscribe', { method: 'api' });

// em catch/error
trackEvent('newsletter_error', { error_type: error.code || 'unknown', error_message: error.message });
```

- [ ] **Step 3: Run tests to verify**

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/components/Newsletter.tsx
git commit -m "feat(analytics): newsletter_subscribe + error no Newsletter"
```

---

### Task 6: Integrar Footer.tsx — external_link_click

**Files:**
- Modify: `apps/landing-page/src/components/Footer.tsx`

- [ ] **Step 1: Add trackEvent on social/document links**

```tsx
// no renderLink ou onClick handler
onClick={() => trackEvent('external_link_click', { link_text, link_url })}
```

- [ ] **Step 2: Run tests to verify**

- [ ] **Step 3: Commit**

```bash
git add apps/landing-page/src/components/Footer.tsx
git commit -m "feat(analytics): external_link_click no Footer"
```

---

### Task 7: Integrar FaqPage.tsx — faq_toggle

**Files:**
- Modify: `apps/landing-page/src/pages/FaqPage.tsx`

- [ ] **Step 1: Read FaqPage.tsx to understand structure**

- [ ] **Step 2: Add trackEvent on details toggle**

```tsx
// no <details> onToggle
onToggle={(e) => trackEvent('faq_toggle', {
  question_slug: faq.slug,
  action: (e.target as HTMLDetailsElement).open ? 'open' : 'close',
})}
```

- [ ] **Step 3: Run tests to verify**

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/pages/FaqPage.tsx
git commit -m "feat(analytics): faq_toggle no FaqPage"
```

---

### Task 8: Criar hooks de profundidade (scroll + tempo)

**Files:**
- Create: `apps/landing-page/src/hooks/useScrollDepth.ts`
- Create: `apps/landing-page/src/hooks/usePageTiming.ts`
- Create: `apps/landing-page/src/hooks/useSectionVisibility.ts`
- Create: testes correspondentes

- [ ] **Step 1: Write failing tests for each hook**

- [ ] **Step 2: Implement useScrollDepth**

```ts
export function useScrollDepth(trackEvent: (name: string, params?: Record<string, unknown>) => void, pagePath: string, locale: string) {
  // Observa scroll a 25/50/75/100%
  // Dispara scroll_depth event
}
```

- [ ] **Step 3: Implement usePageTiming**

```ts
export function usePageTiming(trackEvent: (name: string, params?: Record<string, unknown>) => void, pagePath: string, locale: string) {
  // Timers a 15/30/60/120s
  // Dispara page_time event
}
```

- [ ] **Step 4: Implement useSectionVisibility**

```ts
export function useSectionVisibility(trackEvent: (name: string, params?: Record<string, unknown>) => void, locale: string) {
  // IntersectionObserver nas secoes da home
  // Dispara section_visibility event
}
```

- [ ] **Step 5: Integrar hooks na HomePage.tsx**

- [ ] **Step 6: Run all tests and commit**

```bash
git add apps/landing-page/src/hooks/useScrollDepth.ts apps/landing-page/src/hooks/usePageTiming.ts apps/landing-page/src/hooks/useSectionVisibility.ts
git commit -m "feat(analytics): hooks de scroll_depth, page_time, section_visibility"
```

---

### Task 9: Integrar PressKit + Blog/Tutorial

**Files:**
- Modify: `apps/landing-page/src/pages/PressKitPage.tsx`
- Modify: `apps/landing-page/src/pages/BlogIndex.tsx`
- Modify: `apps/landing-page/src/pages/TutorialsIndex.tsx`

- [ ] **Step 1: Add press_kit_download on PressKit buttons**

- [ ] **Step 2: Add blog_click on Blog post links**

- [ ] **Step 3: Add tutorial_click on Tutorial links**

- [ ] **Step 4: Commit**

```bash
git add apps/landing-page/src/pages/PressKitPage.tsx apps/landing-page/src/pages/BlogIndex.tsx apps/landing-page/src/pages/TutorialsIndex.tsx
git commit -m "feat(analytics): press_kit_download + blog_click + tutorial_click"
```

---

### Task 10: QA e Documentacao

**Files:**
- Create: `docs/adr/ADR-042-analytics-landing-page.md`
- Modify: `docs/analytics-setup.md`

- [ ] **Step 1: Rodar SonarQube em todos os arquivos modificados**

- [ ] **Step 2: Criar ADR-042**

```markdown
# ADR-042: Analytics na Landing Page

**Decisao:** Servico proprio `services/analytics.ts` na landing page, seguindo padrao do monorepo.

**Contexto:** Landing page precisava de eventos custom sem depender do frontend principal. GTM ja configurado, sem fallback proxy.

**Consequencias:** Eventos vao apenas via `dataLayer.push`. Adblock pode bloquear. Setup existente intocado.
```

- [ ] **Step 3: Atualizar docs/analytics-setup.md com novos eventos**

- [ ] **Step 4: Verificar typecheck + build**

Run: `pnpm --filter @cryptobingo/landing-page build`

- [ ] **Step 5: Commit final**

```bash
git add docs/adr/ADR-042-analytics-landing-page.md docs/analytics-setup.md
git commit -m "docs(analytics): ADR-042 + update analytics-setup.md"
```
