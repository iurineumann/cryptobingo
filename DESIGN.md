---
name: CryptoBingo
description: On-chain BINGO platform on WAX — GameFi with progression, NFT mechanics, and provably fair draws.
colors:
  primary: "#8b5cf6"
  neutral-bg: "#0f0f1a"
  neutral-surface: "#1a1a2e"
  neutral-elevated: "#1e1e35"
  neutral-sunken: "#0a0a0f"
  accent-gold: "#fbbf24"
  text-primary: "#f1f5f9"
  text-secondary: "#94a3b8"
  text-tertiary: "#64748b"
  success: "#34d399"
  danger: "#fb7185"
  warning: "#fbbf24"
  info: "#60a5fa"
  bingo-b: "#ef4444"
  bingo-i: "#f97316"
  bingo-n: "#22c55e"
  bingo-g: "#3b82f6"
  bingo-o: "#a855f7"
typography:
  display:
    fontFamily: "Space Grotesk, Inter, sans-serif"
    fontWeight: 800
    lineHeight: 1.15
  body:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontSize: "clamp(0.9375rem, 0.90rem + 0.25vw, 1rem)"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Inter, system-ui, -apple-system, sans-serif"
    fontWeight: 600
    letterSpacing: "0.01em"
  mono:
    fontFamily: "JetBrains Mono, Fira Code, monospace"
rounded:
  sm: "0.5rem"
  md: "0.625rem"
  lg: "1rem"
  xl: "1.25rem"
  pill: "9999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "1rem"
  lg: "1.5rem"
  xl: "2rem"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#ffffff"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  button-accent:
    backgroundColor: "{colors.accent-gold}"
    textColor: "#1a1a2e"
    rounded: "{rounded.md}"
    padding: "0.625rem 1.25rem"
  button-outline:
    backgroundColor: transparent
    textColor: "{colors.text-primary}"
    rounded: "{rounded.md}"
    border: "1px solid var(--cb-border-default)"
  card:
    backgroundColor: "{colors.neutral-surface}"
    rounded: "{rounded.lg}"
    padding: "1.25rem"
    border: "1px solid var(--cb-border-default)"
---
# Design System: CryptoBingo

## 1. Overview

**Creative North Star: "The Neon-Lit Casino Vault"**

Dark, confident, playfully premium — CryptoBingo lives in a violet-gold atmosphere where on-chain transparency meets game-night energy. The surface is near-black with subtle violet undertones; gold is the accent of value. This is not a crypto dashboard or a cartoon bingo hall. It is a tasteful, modern GameFi platform where every state reads clearly and progression feels rewarding.

Bold typography (Space Grotesk for headings, Inter for body) drives hierarchy. Motion is restrained to state changes. Cards have rounded corners and subtle shadows. The system is dark-by-default with a light theme courtesy; WCAG AA contrast is a floor, not a stretch goal.

**Key Characteristics:**
- Dark-by-default violet-black canvas, gold accent, subtle glows for state
- Near-black surfaces with layered elevation (sunken → base → elevated → overlay)
- 1rem rounded corners on cards, 0.625rem on buttons, pills everywhere for tags
- Space Grotesk for display/interactive moments, Inter for reading, JetBrains Mono for data
- Motion at 150–250ms for state transitions only; no decorative choreography
- Design tokens as CSS custom properties via Tailwind v4 `@theme` + semantic `--cb-*` layer

## 2. Colors

Violet-purple primary on near-black canvas, amber-gold for value and winning moments. Chroma stays restrained; the glow is earned by state (hover, win, active).

### Primary
- **Violet** (`#8b5cf6`): Primary brand — buttons, links, focus rings, selection. Glow variant on hover. Used on ≤15% of any screen.

### Accent
- **Amber Gold** (`#fbbf24`): Winning moments, prizes, accent CTAs, progress fills. The color of payout.

### Neutral
- **Sunken** (`#0a0a0f`): Deepest background, modals backdrop
- **Base** (`#0f0f1a`): Default body background
- **Surface** (`#1a1a2e`): Cards, elevated panels
- **Overlay** (`#1e1e35`): Inputs, hovered items, secondary surfaces
- **Text Primary** (`#f1f5f9`): Body text, headings
- **Text Secondary** (`#94a3b8`): Subtle labels, metadata
- **Text Tertiary** (`#64748b`): Placeholders, disabled text

### Bingo Column Colors
- B: Red (`#ef4444`) — I: Orange (`#f97316`) — N: Green (`#22c55e`) — G: Blue (`#3b82f6`) — O: Purple (`#a855f7`)

### Named Rules
**The Glow-Earns-Its-Place Rule.** Glows appear only on hover (buttons), active (selected items), and winning state (golden glow). Never decorative. A resting element never glows.

**The One-Token Palette Rule.** No semantic color appears in two values. `--cb-success` is the only success token; `--cb-danger` is the only danger. Variants are light/dark theme mappings, not independent colors.

## 3. Typography

**Display Font:** Space Grotesk (weights 700–800)
**Body Font:** Inter (weights 400–700)
**Mono Font:** JetBrains Mono (weights 500–700)

**Character:** Geometric confidence — Space Grotesk gives headings a slightly wider, modern presence. Inter is neutral and highly readable at small sizes. The pairing covers display moments (room names, stats, tier badges) and dense reading (game history, admin panels).

### Hierarchy
- **Display** (800, clamp(1.35rem, 1.25rem + 1vw, 1.5rem) → clamp(2.4rem, 2.00rem + 2.5vw, 3rem)): Hero numbers, big stats, room names.
- **Title** (700, clamp(1.0625rem, 1.00rem + 0.5vw, 1.125rem)): Card titles, section heads.
- **Body** (400, clamp(0.9375rem, 0.90rem + 0.25vw, 1rem), line-height 1.6): Continuous reading. Max 75ch.
- **Label** (600, 0.75rem–0.875rem, 0.01em letter-spacing): Button text, chip labels, table cells.
- **Monospace** (600–700, 0.65rem–0.95rem): Wallet addresses, ticket IDs, ball numbers, amounts.

### Named Rules
**The Display-Only Rule.** Space Grotesk is reserved for display, headings, and values. Never for body text, labels, or UI copy.

## 4. Elevation

Flat by default; depth is conveyed via tonal layering (sunken → base → surface → elevated → overlay). Shadows are subtle — used exclusively on cards and modals, never as decoration.

### Shadow Vocabulary
- **Card** (`box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.3), 0 2px 4px -2px rgb(0 0 0 / 0.3)`): Resting card state.
- **Card Hover** (`0 20px 25px -5px rgb(0 0 0 / 0.4), 0 8px 10px -6px rgb(0 0 0 / 0.4)`): Elevated card on hover.
- **Modal** (`0 25px 50px -12px rgb(0 0 0 / 0.7)`): Modal, drawer, overlay panels.
- **Glow Brand** (`0 0 20px -4px rgb(124 58 237 / 0.6)`): Primary button hover, active brand elements.
- **Glow Accent** (`0 0 20px -4px rgb(245 158 11 / 0.7)`): Winning elements, accent CTAs.

## 5. Components

### Buttons
- **Shape:** Rounded-md (0.625rem). Pill (`rounded-9999px`) available as `cb-btn-pill`.
- **Primary (Violet):** bg `#8b5cf6`, white text. Hover: brighter violet + brand glow. Active: darker violet + scale(0.97).
- **Accent (Gold):** bg `#fbbf24`, dark text `#1a1a2e`. Hover: brighter gold + accent glow. For winning CTAs and high-emphasis actions.
- **Outline:** Transparent bg, white text, subtle border. Hover: violet tint bg + violet border.
- **Ghost:** Transparent, secondary text. Hover: subtle border tint. For toolbar/context actions.
- **Sizes:** sm (0.375rem 0.875rem), default (0.625rem 1.25rem), lg (0.875rem 2rem), xl (1rem 2.5rem).
- **Loading:** Spinner via `::before` pseudo-element + disabled pointer-events.

### Chips & Badges
- **Shape:** Pill (9999px). Dense padding (0.2rem 0.6rem). Font size xs.
- **Variants:** Brand (violet bg/subtle) · Accent (gold) · Success (green) · Danger (red) · Warning (amber) · Neutral (gray).
- **Tier Badges:** Gradient backgrounds matching tier color. 9-tier progression: Cobre → Bronze → Prata → Ouro → Platina → Esmeralda → Safira → Rubi → Diamante.
- **Status Chips:** Game state indicators (created · funding · locked · drawing · drawn · archived · aborted).

### Cards
- **Shape:** Rounded-lg (1rem). Padding 1.25rem.
- **Appearance:** Surface background (`#1a1a2e`), subtle border, card shadow. Hover: stronger border + card-hover shadow + translateY(-1px).
- **States:** `is-winner` (golden glow), `is-watching` (violet glow), `is-funding`/`is-drawing`/`is-idle` (colored border tint).

### Inputs
- **Shape:** Rounded-md (0.625rem). Surface-700 bg, subtle border.
- **Focus:** Violet border + 3px violet shadow ring. Placeholder: text-tertiary.
- **Select:** Custom chevron SVG via background-image.

### Progress Bar
- **Track:** 0.375rem height, pill shape. Subtle border bg.
- **Fill:** Violet-to-gold gradient. 400ms ease-out width transition. Brand glow.
- Used for: game progress, XP level progress.

### Navigation
- **Top bar:** Sticky, backdrop-blur glass effect (85% base bg). 4rem height. Border-bottom subtle.
- **Tab bar:** Overlay bg, pill segmented control style. Active tab: base bg + shadow.
- **Sidebar:** 14.5rem width, border-right, scroll. Active item: violet bg + left accent bar.

## 6. Do's and Don'ts

### Do:
- **Do** use violet (`#8b5cf6`) as the single primary action color across all surfaces.
- **Do** use gold (`#fbbf24`) exclusively for winning moments, prize amounts, and accent CTAs.
- **Do** use tonal layering (sunken → base → surface → elevated) for depth instead of shadows.
- **Do** keep motion at 150–250ms for state transitions (hover, focus, active).
- **Do** use `data-testid` attributes on all interactive elements for E2E.
- **Do** respect `prefers-reduced-motion` — every animation has a crossfade or instant fallback.
- **Do** keep body text at WCAG AA ≥4.5:1 against the dark canvas.

### Don't:
- **Don't** use glassmorphism (backdrop-blur on card surfaces) — reserved for navbar only.
- **Don't** use gradient text (`background-clip: text` with gradient) — solid color only.
- **Don't** use side-stripe borders (border-left >1px as accent) — use full background tint or nothing.
- **Don't** use uppercase tracking on every section heading — reserved for sublabels and chip text.
- **Don't** use bounce or elastic easing — stick to cubic-bezier(0.4, 0, 0.2, 1) or ease-out-quart.
- **Don't** use display fonts for body text, labels, buttons, or data.
- **Don't** stack modals — use inline/expandable alternatives first.
- **Don't** use ghost buttons for primary actions — primary actions get filled violet or gold.
