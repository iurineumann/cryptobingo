# Fase 8.5 — Páginas Dedicadas + Nav Fix + CORS

## Escopo

Frontend wrappers dedicados para páginas de conteúdo, fix do dropdown "Explorar" (refresh loop), nav LandingPage expandida, e CORS test-swap.

### 1. Páginas Dedicadas

Cada página em `apps/frontend/src/pages/` é um wrapper fino (~10-15 linhas) sobre `ContentPage` genérico. Cria extension point para layout customizado futuro sem afetar outros tipos.

```
apps/frontend/src/pages/
  TutorialsPage.tsx     → <ContentPage type="tutorials"    testId="tutorials"    titleKey="nav.tutorials" />
  HowItWorksPage.tsx    → <ContentPage type="howitworks"   testId="how-it-works" titleKey="nav.how_it_works" />
  SponsorsPage.tsx      → <ContentPage type="sponsors"     testId="sponsors"     titleKey="nav.sponsors" />
```

Cada wrapper: importa `ContentPage`, exporta default com props fixas. `data-testid` próprio.

### 2. TutorialsAdmin

Wrapper fino em `apps/frontend/src/components/admin/TutorialsAdmin.tsx` que pré-seleciona tab "tutorials" do `ContentAdmin`.

```tsx
export default function TutorialsAdmin() {
  return <ContentAdmin defaultType="tutorials" />;
}
```

Requer add `defaultType` prop opcional em `ContentAdmin.tsx`.

### 3. Nav "Explorar" — Fix Refresh Loop

**Problema atual (App.tsx:422-452):** `onMouseEnter`/`onMouseLeave` + state `showExplore` vive em `AppRoot`. Gap CSS entre botão e dropdown causa toggle loop → AppRoot re-renderiza → `<Outlet />` remonta → lobby refetch.

**Fix:** Substituir JS toggle por CSS `:hover` no wrapper. Zero re-render.

```css
/* globals.design.css */
.site-tab-dropdown:hover .site-dropdown-menu,
.site-tab-dropdown:focus-within .site-dropdown-menu {
  display: flex;
}
.site-dropdown-menu {
  display: none;
}
```

Remover `onMouseEnter`/`onMouseLeave` e `showExplore` state (ou manter só p/ `aria-expanded`). Se `showExplore` removido completamente, mover para dentro do componente `PlayerShell` isoladamente.

### 4. LandingPage Nav

Substituir links soltos por dropdown "Explorar" (mesmo padrão do PlayerShell).

**Antes:**
```tsx
<a href="/how-it-works">How It Works</a>
<a href="/news">News</a>
<a href="#sponsors">Sponsors</a>
```

**Depois:**
```tsx
<div className="site-tab-dropdown">
  <button className="site-tab">Explorar ▾</button>
  <div className="site-dropdown-menu">
    <a href="/how-it-works">How It Works</a>
    <a href="/sponsors">Sponsors</a>
    <a href="/tutorials">Tutorials</a>
    <a href="/faq">FAQ</a>
    <a href="/news">News</a>
  </div>
</div>
```

Ancora `#sponsors` na página da LandingPage mantida (seção sponsors existe). Nav leva para rota `/sponsors`.

### 5. Rotas (App.tsx)

Trocar `ContentPage` direto pelos wrappers:

```tsx
import TutorialsPage from './pages/TutorialsPage';
import HowItWorksPage from './pages/HowItWorksPage';
import SponsorsPage from './pages/SponsorsPage';

// ...
<Route path="/how-it-works" element={<HowItWorksPage />} />
<Route path="/sponsors"     element={<SponsorsPage />} />
<Route path="/tutorials"    element={<TutorialsPage />} />
```

### 6. CORS

Adicionar `https://test-swap.cryptobingo.bet` no `DEFAULT_ALLOWED_ORIGINS` em `apps/api-gateway/src/cors.ts`. Já está no working tree (unstaged).

### 7. Testes (TDD)

| Teste | Arquivo |
|---|---|
| TutorialsPage renderiza ContentPage com type="tutorials" | `pages/TutorialsPage.test.tsx` |
| HowItWorksPage renderiza ContentPage com type="howitworks" | `pages/HowItWorksPage.test.tsx` |
| SponsorsPage renderiza ContentPage com type="sponsors" | `pages/SponsorsPage.test.tsx` |
| TutorialsAdmin renderiza ContentAdmin | `components/admin/TutorialsAdmin.test.tsx` |
| dropdown explorar abre/fecha via CSS hover | (E2E ou characterization) |

Cada teste: mock `react-i18next`, mock `fetchContentByType`, assert `data-testid` correto.

### 8. Não-escopo

- Mudar layout do ContentPage (wrapper permite customização futura)
- Remover ContentPage genérico (FAQ e News continuam usando)
- Alterar API de conteúdo ou tipos on-chain
- Migrar EventFeed para GameRoom (já feito no commit 600d32a)

## Ordens de implementação

1. TutorialsPage wrapper + test (TDD)
2. HowItWorksPage wrapper + test (TDD)
3. SponsorsPage wrapper + test (TDD)
4. TutorialsAdmin wrapper + test (TDD)
5. Nav fix — dropdown CSS hover (App.tsx + CSS)
6. LandingPage nav — dropdown Explorar
7. Rotas: App.tsx trocar ContentPage → wrappers
8. CORS commit

## Referências

- ADR-037: Sistema de conteúdo unificado
- ContentPage: `apps/frontend/src/components/content/ContentPage.tsx`
- ContentAdmin: `apps/frontend/src/components/admin/ContentAdmin.tsx`
- PlayerShell dropdown: `apps/frontend/src/App.tsx:422-452`
- LandingPage nav: `apps/frontend/src/components/LandingPage.tsx:256-261`
