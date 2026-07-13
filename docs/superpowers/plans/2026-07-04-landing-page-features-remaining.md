# Landing Page — Remaining Issues Implementation Plan

**11 issues, 3 tracks.** Branch: `feature/lp-features-restantes`

## Track A — Performance (2 issues)

### A1. Lighthouse audit (#174)
- Target: Perf>=90, A11y>=95, SEO>=95
- Run Lighthouse CI or local
- Fix critical issues found
- No regressions in existing tests

### A2. Bundle audit + tree-shake (#171)
- Analyze bundle with `vite-bundle-visualizer` or rollup-plugin-visualizer
- Lazy-load tinacms-related code
- Tree-shake unused icons from lucide-react
- Verify build size before/after

**Files:** apps/landing-page/, apps/landing-page/package.json

## Track B — UX Features (8 issues)

### B1. Live activity feed (#154)
New component showing recent wins in real-time.
- src/components/ActivityFeed.tsx
- Feature flag: shows mock data if chain unavailable
- Event: `win_displayed` analytics

### B2. How It Works BAB section (#157)
Redesign HowItWorks with Before/After/Bridge narrative.
- Modify: src/components/HowItWorks.tsx
- New copy, new visual flow

### B3. Hero CTA pulse animation + timer (#158)
Add pulsing glow animation to hero CTA + optional countdown timer for next game.
- Modify: src/components/Hero.tsx
- CSS animation (pulse glow)

### B4. Urgency timer header (#159)
Small countdown timer in Header showing time to next game.
- Modify: src/components/Header.tsx
- Reads from blockchain or mock interval

### B5. Wallet UX value-first (#160)
Restructure wallet section to show value proposition before technical steps.
- Modify: src/components/WalletSection.tsx or similar

### B6. Header hamburger menu mobile (#161)
Replace current mobile nav with hamburger drawer.
- Modify: src/components/Header.tsx
- CSS-only or minimal JS toggle

### B7. StatsBar counting-up animation (#156)
Animated number counting for stats (games played, prizes paid, etc.).
- Modify: src/components/StatsBar.tsx
- IntersectionObserver trigger + requestAnimationFrame

### B8. Hero imagery screenshot/video (#153)
Add game screenshot or video mockup to Hero section.
- Modify: src/components/Hero.tsx
- Static image with play button overlay

## Track C — Fixes (2 issues + cleanup)

### C1. i18n locale keys faltando (#152)
Audit and fix missing locale keys, remove pt-BR hardcoded strings.
- Files: src/locales/{en,pt,zh}.json, affected components

### C2. Feature icon fix + layout (#151)
Fix broken icons in Features component, fix layout breakage.
- Modify: src/components/Features.tsx

### C3. Close #155 (TrustBar exists, issue can close)

## Execution Order

```
Week 1: Track C (fixes — small, unblocking)
         └─→ Track B (UX features — parallelizable)
Week 2: Track A (performance — needs everything else stable)
         └─→ PR + deploy
```

## Constraints
- Testes existentes devem continuar passando
- Build deve compilar limpo
- TDD para novos componentes
- Sem comentarios em codigo
- i18n para todo texto visivel (pt/en/zh)
