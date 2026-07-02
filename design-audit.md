# Design System Audit — CleanPlate

## Executive Summary

The CleanPlate app has **strong design token infrastructure** with well-defined color, typography, and spacing systems, but exhibits **moderate-to-high implementation drift**. The foundation is solid — CSS custom properties and OKLCH colors are centralized in `app/globals.css` — but component implementation spreads tokens across inline styles and Tailwind utilities inconsistently. The largest drift hotspot is hardcoded hex colors (especially `#FF7444`, the accent color) scattered across 20+ components, and inconsistent use of signal colors (`#4A7C59`, `#C5A04A`, `#FF8060`) in styling.

**Drift severity:** Medium–High (affects visual consistency and maintenance burden)

---

## 1. Design Tokens Inventory

### A. Color Tokens (CSS Custom Properties)

**Location:** `app/globals.css` (lines 8–19)

```css
:root {
  --background: oklch(0.08 0 0);        /* #0d0d0d — dark base */
  --foreground: oklch(0.95 0 0);        /* #f2f2f2 — light text */
  --card: oklch(0.12 0 0);              /* #1f1f1f — card bg */
  --card-foreground: oklch(0.95 0 0);   /* #f2f2f2 — card text */
  --muted: oklch(0.25 0 0);             /* #404040 — secondary text base */
  --muted-foreground: oklch(0.65 0 0);  /* #a6a6a6 — secondary text */
  --border: oklch(0.22 0 0);            /* #383838 — borders */
  --accent: #FF7444;                    /* Coral orange — primary accent */
  --accent-foreground: oklch(0.08 0 0); /* #0d0d0d — text on accent */
  --radius: 0rem;                       /* No rounding (editorial aesthetic) */
}

@theme inline {
  /* Typography */
  --font-sans: "IBM Plex Sans", sans-serif;
  --font-mono: "IBM Plex Mono", monospace;
  --font-display: "Bebas Neue", sans-serif;

  /* Color scale mapping */
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --color-card: var(--card);
  --color-card-foreground: var(--card-foreground);
  --color-muted: var(--muted);
  --color-muted-foreground: var(--muted-foreground);
  --color-border: var(--border);
  --color-accent: var(--accent);

  /* Border radius scale (all 0rem — intentional) */
  --radius-sm: 0rem;
  --radius-md: 0rem;
  --radius-lg: 0rem;
  --radius-xl: 0rem;
  --radius-2xl: 0rem;
  --radius-3xl: 0rem;
}
```

### B. Score-Based Color System (Semantic Colors)

**Location:** `lib/score.ts` (lines 236–254)

These colors are score-triggered and programmatically generated (not CSS tokens):

| Score Range | Label | Color Hex |
|---|---|---|
| ≥85 | Excellent | `#4A7C59` — Green |
| 75–84 | Great Option | `#576A8F` — Blue |
| 65–74 | Good Option | `#6B78C5` — Purple-blue |
| 55–64 | Ask Questions | `#8B7BC5` — Purple |
| 40–54 | Limited/Inconsistent | `#C5A04A` — Gold/Tan |
| <40 | High Risk | `#FF7444` — Coral |
| null | No Data | `#C5C8D6` — Gray |

### C. Signal Colors (Review/Data Sentiment)

**Location:** `app/page.tsx` (lines 174–177)

```javascript
const signalConfig = {
  positive: { dot: "#4ADE80" },   // Bright green (from Tailwind)
  warning:  { dot: "#FACC15" },   // Bright yellow (from Tailwind)
  error:    { dot: "#FF7444" },   // Coral (accent color)
};
```

**Location:** `app/restaurant/[slug]/page.tsx` (lines 94–120)

```javascript
function signalColor(level: SignalLevel): string {
  switch (level) {
    case "positive": return "#7ECF9A";           // Muted green — DIFFERENT from page.tsx
    case "neutral":  return "oklch(0.72 0 0)";
    case "warning":  return "#D4AE62";            // Muted gold — DIFFERENT from page.tsx
    case "negative": return "#FF8060";            // Slightly different red — DIFFERENT from page.tsx
    default:         return "oklch(0.62 0 0)";
  }
}
```

### D. Typography Tokens

**Font Families:** Defined in `@theme inline` (globals.css:22–24)
- `--font-sans`: IBM Plex Sans (body text, form inputs)
- `--font-mono`: IBM Plex Mono (labels, metadata, code)
- `--font-display`: Bebas Neue (large headings, score displays)

**Font Sizes:** No centralized scale. Arbitrary Tailwind values scattered throughout:
- `text-[8px]`, `text-[9px]`, `text-[10px]`, `text-[11px]`, `text-[13px]`, `text-[14px]`, `text-[15px]`, `text-[16px]`, `text-[19px]`
- `text-[1.5rem]` (rare)
- Responsive: `clamp()` in inline styles (e.g., `font-size: clamp(1.4rem, 3vw, 2rem)`)

**Font Weights:** Used ad-hoc (`font-semibold`, `font-[600]`, `font-[700]`)

**Letter Spacing:** Tailwind arbitrary values with no consistent pattern:
- `tracking-[0.2em]` (most common — uppercase labels)
- `tracking-[0.15em]`, `tracking-[0.25em]`, `tracking-[0.12em]`, `tracking-[0.08em]`

### E. Spacing Tokens

No centralized spacing scale. Uses Tailwind defaults + arbitrary values.

### F. Radius Tokens

All set to `0rem` — intentional editorial/sharp aesthetic. Consistent throughout.

---

## 2. Where Tokens Are Defined

| File | Lines | What |
|---|---|---|
| `app/globals.css` | 8–42 | CSS custom properties, typography, OKLCH color scale, radius tokens |
| `lib/score.ts` | 236–254 | Score-based color function `getGaugeColor()` & `getScoreLabel()` |
| `app/page.tsx` | 174–177 | Signal colors for homepage review sentiments |
| `app/restaurant/[slug]/page.tsx` | 94–120 | Signal colors + backgrounds for detail page (CONFLICTING) |

No `tailwind.config.ts` with custom theme extensions. Tailwind v4 defaults only.

---

## 3. Usage Consistency Analysis

### Strengths

1. **OKLCH color scale in `globals.css`** — semantic naming, perceptually uniform, all background/foreground pairs defined.
2. **Score-based colors centralized in `lib/score.ts`** — `getGaugeColor(score)` used consistently in `SafetyGauge.tsx`, `page.tsx`, and `TopRatedSection.tsx`.
3. **Font families** — consistently applied via Tailwind's `font-mono`, `font-sans`, and `font-[family-name:var(--font-display)]`.
4. **Border radius** — universally `0rem`; no drift.

### Weaknesses

1. `#FF7444` hardcoded in inline styles instead of `var(--accent)` — 41+ instances.
2. OKLCH values hardcoded in inline styles instead of using CSS variables — 200+ instances.
3. Signal colors defined twice with conflicting values across two files.
4. No typography scale; font sizes range arbitrarily from 8px to 19px.
5. Opacity variants applied ad-hoc as hex suffixes (`#FF744420`, `#FF744430`, etc.).

---

## 4. Hardcoded Value Findings

### A. Hardcoded Hex Colors (Top 20)

| File | Line | Value | Should Use |
|---|---|---|---|
| `app/page.tsx` | 175 | `#4ADE80` | `--signal-positive` token |
| `app/page.tsx` | 176 | `#FACC15` | `--signal-warning` token |
| `app/page.tsx` | 177 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 295 | `#FF744430` | `var(--accent)` + opacity utility |
| `app/page.tsx` | 297 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 303 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 308 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 328 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 348 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 358 | `#FF7444` | `var(--accent)` |
| `app/page.tsx` | 464 | `#FF7444` | `var(--accent)` |
| `app/components/Nav.tsx` | 86 | `#FF7444` | `var(--accent)` |
| `app/components/Nav.tsx` | 105 | `#FF7444` | `var(--accent)` |
| `app/components/Nav.tsx` | 118 | `#FF7444` | `var(--accent)` |
| `app/components/HomeAskInput.tsx` | 46 | `#FF7444` | `var(--accent)` |
| `app/components/LocationBanner.tsx` | 68 | `#FF7444` | `var(--accent)` |
| `app/components/TopRatedSection.tsx` | 49 | `#FF7444` | `var(--accent)` |
| `app/components/TopRatedSection.tsx` | 114–116 | `#FF7444` (3x) | `var(--accent)` |
| `app/restaurant/[slug]/page.tsx` | 96 | `#7ECF9A` | Centralized signal token |
| `app/gluten-free/[...slug]/page.tsx` | 420, 467, 478, 650+ | `#FF7444` (8x) | `var(--accent)` |

### B. Hardcoded OKLCH Colors (Sample)

| File | Line | Value | Should Map To |
|---|---|---|---|
| `app/page.tsx` | 214 | `oklch(0.62_0_0)` | `var(--muted-foreground)` |
| `app/page.tsx` | 266 | `oklch(0.70_0_0)` | `var(--muted-foreground)` |
| `app/page.tsx` | 371 | `oklch(0.82_0_0)` | near `var(--foreground)` |
| `app/components/SafetyGauge.tsx` | 54 | `oklch(0.2 0 0)` | `var(--card)` (darker variant) |
| `app/components/SafetyGauge.tsx` | 60 | `oklch(0.08 0 0)` | `var(--background)` |
| `app/components/Nav.tsx` | 96 | `oklch(0.08 0 0)` | `var(--background)` |
| `app/components/Nav.tsx` | 96 | `oklch(0.18 0 0)` | near `var(--border)` |
| `app/ask/AskPage.tsx` | 59 | `oklch(0.12 0 0)` | `var(--card)` |
| `app/ask/AskPage.tsx` | 72 | `oklch(0.12 0 0)` | `var(--card)` |
| `app/ask/AskPage.tsx` | 93 | `oklch(0.12 0 0)` | `var(--card)` |
| `app/rankings/RankingsFilters.tsx` | 44 | `oklch(0.28 0 0)` | near `var(--border)` |
| `app/rankings/RankingsFilters.tsx` | 46 | `oklch(0.1 0 0)` | near `var(--card)` |
| `app/components/TopRatedSection.tsx` | 42 | `oklch(0.2 0 0)` | near `var(--card)` |
| `app/components/TopRatedSection.tsx` | 42 | `oklch(0.1 0 0)` | near `var(--card)` |

### C. Inconsistent Font Sizes

| Size | Occurrences | Issue |
|---|---|---|
| `8px` | 1 | Below mobile minimum |
| `9px` | 5 | Should be a named token |
| `10px` | 19 | High frequency — needs standardization |
| `11px` | 16 | High frequency — needs standardization |
| `12px` | 1 | Rarely used (should be more common) |
| `13px` | 2 | Ad-hoc |
| `14px` | 1 | Should be more common |
| `15px` | 1 | Ad-hoc |
| `16px` | 1 | Should be more common |

No centralized scale. Missing Tailwind standard sizes (`text-xs`, `text-sm`, `text-base`).

### D. Opacity Variants (Hardcoded Hex Suffix)

| Value | Opacity | Files |
|---|---|---|
| `#FF744412` | ~7% | Various |
| `#FF744420` | ~12.5% | Various |
| `#FF744430` | ~18.75% | `page.tsx`, `gluten-free/` |
| `#FF744440` | ~25% | Various |
| `#FF744450` | ~31.25% | Various |
| `#FF744460` | ~37.5% | Various |

These should use `bg-accent/10`, `bg-accent/20`, etc. (Tailwind opacity modifiers) or CSS `color-mix()`.

---

## 5. Drift Hotspots — Ranked by Severity

### 🔴 CRITICAL — Accent Color Hardcoding

**Files:** 7 files, 41+ occurrences  
`app/page.tsx`, `app/gluten-free/[...slug]/page.tsx`, `app/components/Nav.tsx`, `app/ask/AskPage.tsx`, `app/components/HomeAskInput.tsx`, `app/components/LocationBanner.tsx`, `app/components/TopRatedSection.tsx`

`#FF7444` is hardcoded in inline styles instead of using `var(--accent)`. Changing the brand accent color would require 41+ manual edits. Token already exists — this is pure non-use.

```jsx
// Current:
style={{ backgroundColor: "#FF7444", color: "oklch(0.08 0 0)" }}

// Should be:
className="bg-accent text-accent-foreground"
// or:
style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
```

---

### 🟠 HIGH — OKLCH Values Inlined

**Files:** 8+ files, 200+ occurrences  
`app/page.tsx` (40+), `app/ask/AskPage.tsx` (10+), `app/rankings/RankingsFilters.tsx` (15+), `app/components/TopRatedSection.tsx` (8+), and more.

OKLCH values that exactly match (or closely match) CSS custom properties are hardcoded in `style={}` attributes. Makes color intent opaque and prevents centralized changes.

```jsx
// Current:
style={{ borderColor: "oklch(0.22 0 0)" }}

// Should be:
className="border-border"
// or:
style={{ borderColor: "var(--border)" }}
```

---

### 🟠 HIGH — Signal Color Duplication

**Files:** `app/page.tsx:174–177` vs `app/restaurant/[slug]/page.tsx:94–120`

The same semantic signals (positive/warning/negative) are defined twice with different hex values:

| Signal | `page.tsx` | `restaurant/[slug]/page.tsx` |
|---|---|---|
| positive | `#4ADE80` (bright) | `#7ECF9A` (muted) |
| warning | `#FACC15` (yellow) | `#D4AE62` (gold) |
| negative | `#FF7444` | `#FF8060` |

No centralized source of truth. Homepage and detail pages render signals inconsistently.

---

### 🟡 MEDIUM — Typography Not Tokenized

**Files:** All components

Font sizes range from 8px to 19px with no scale. Mixed usage of Tailwind arbitrary classes (`text-[11px]`) and inline styles (`style={{ fontSize: "1.1rem" }}`). No centralized type scale means visual hierarchy decisions are made locally in each component.

---

### 🟡 MEDIUM — Opacity Variants Scattered

**Files:** 5+ files

Opacity applied by appending hex digits to `#FF7444` (6 different variants). No systematic opacity scale. Tailwind's built-in opacity modifier (`bg-accent/20`) would make these consistent and readable.

---

### 🟡 LOW — Spacing Inconsistencies

**Files:** All components (minor)

Mostly uses Tailwind defaults. Some inline `gap: 16` (px) mixed with Tailwind `gap-4` (rem). Card padding varies (`p-3`, `p-4`, `p-5`) across similar components. Low impact.

---

### 🟢 LOW — OG Image Hardcoding (Acceptable)

**File:** `app/restaurant/[slug]/opengraph-image.tsx`

Hex colors hardcoded (`#0d0d0d`, `#f2f2f2`, etc.) but context-appropriate — OG image generation doesn't participate in the CSS token system. Acceptable to leave as-is.

---

## 6. Recommendations

### Priority 1: Replace `#FF7444` with `var(--accent)`

All 41+ instances in inline styles. Token already exists — this is a pure find-and-replace.

```jsx
// Before:
style={{ backgroundColor: "#FF7444" }}
style={{ color: "#FF7444" }}
style={{ borderColor: "#FF7444" }}

// After:
className="bg-accent"
className="text-accent"
className="border-accent"
```

Also replace `oklch(0.08 0 0)` adjacent to accent usage with `var(--accent-foreground)`.

---

### Priority 2: Centralize Signal Colors

Create `lib/tokens/signals.ts`:

```typescript
export const SIGNAL_COLORS = {
  positive: "#7ECF9A",   // muted green (prefer over bright #4ADE80 on dark bg)
  warning:  "#D4AE62",   // muted gold
  negative: "#FF7444",   // accent — consistent with brand
  neutral:  "oklch(0.72 0 0)",
} as const;

export const SIGNAL_BG = {
  positive: "#4A7C590D",
  warning:  "#C5A04A0D",
  negative: "#FF74440D",
  neutral:  "oklch(0.095 0 0)",
} as const;

export const SIGNAL_BORDER = {
  positive: "#4A7C5938",
  warning:  "#C5A04A38",
  negative: "#FF744438",
  neutral:  "oklch(0.18 0 0)",
} as const;
```

Remove duplicate definitions from both `page.tsx` and `restaurant/[slug]/page.tsx`.

---

### Priority 3: Replace OKLCH Inline Values with CSS Vars

High-frequency substitutions:

| Hardcoded | Replace With |
|---|---|
| `oklch(0.08 0 0)` | `var(--background)` |
| `oklch(0.12 0 0)` | `var(--card)` |
| `oklch(0.22 0 0)` | `var(--border)` |
| `oklch(0.65 0 0)` | `var(--muted-foreground)` |
| `oklch(0.95 0 0)` | `var(--foreground)` |

For values that don't map exactly (e.g., `oklch(0.18 0 0)` used as a lighter border), add named tokens:

```css
:root {
  --border-subtle: oklch(0.18 0 0);
  --card-elevated: oklch(0.10 0 0);
}
```

---

### Priority 4: Add a Typography Scale

Add to `globals.css`:

```css
:root {
  /* Type scale */
  --text-2xs: 0.5625rem;   /* 9px */
  --text-xs:  0.625rem;    /* 10px */
  --text-sm:  0.6875rem;   /* 11px */
  --text-base: 0.875rem;   /* 14px */
  --text-lg:  1rem;        /* 16px */

  /* Letter spacing */
  --tracking-label: 0.15em;
  --tracking-wide: 0.2em;
  --tracking-wider: 0.25em;
}
```

Map to Tailwind custom classes or use CSS variables in components consistently.

---

### Priority 5: Use Tailwind Opacity Modifiers

Replace hex-with-opacity variants:

```jsx
// Before:
style={{ backgroundColor: "#FF744420" }}

// After:
className="bg-accent/[0.125]"
// or add to CSS:
// bg-accent/10, bg-accent/20, etc.
```

---

## 7. Summary

| Issue | Occurrences | Effort | Priority |
|---|---|---|---|
| `#FF7444` hardcoded instead of `var(--accent)` | 41+ | 1–2 hrs | **CRITICAL** |
| OKLCH values inlined instead of CSS vars | 200+ | 2–3 hrs | **HIGH** |
| Signal colors duplicated with conflicting values | 2 definition sites | 30 min | **HIGH** |
| No typography scale | Systemic | 2–3 hrs | **MEDIUM** |
| Opacity variants as hex suffixes | 15+ | 1 hr | **MEDIUM** |
| Spacing inconsistencies | Minor | 30 min | **LOW** |

**What's working:** CSS custom properties foundation, OKLCH system, centralized score colors, consistent font families, zero border radius throughout.

**Total estimated effort to resolve all issues:** 4–6 hours.
