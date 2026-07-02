# Current Design System — CleanPlate (Empirical)

This document describes what the site actually looks like today, derived from counting every value across 169 source files. Counts are raw occurrences of class names or style values.

---

## Color

### Accent

One accent color used everywhere — coral orange. It appears in six opacity variants, all hardcoded as hex with alpha suffix.

| Value | Count | Usage |
|---|---|---|
| `#FF7444` | 169 | Base accent — buttons, links, active states, highlights |
| `#FF744460` | 26 | ~37% opacity — underline decorations, secondary borders |
| `#FF744420` | 22 | ~12.5% opacity — active background fills |
| `#FF744410` | 18 | ~6% opacity — very light tint backgrounds |
| `#FF744408` | 16 | ~3% opacity — near-invisible hover hints |
| `#FF744415` | 14 | ~8% opacity — filter pill active backgrounds |
| `#FF744450` | 7 | ~31% opacity — medium emphasis overlays |
| `#FF744440` | 5 | ~25% opacity — borders on hover/active cards |
| `#FF744430` | 4 | ~19% opacity — alert box borders |

The accent is also defined as `--accent: #FF7444` in `globals.css`, but components ignore this token and reference the hex directly.

### Neutral Surface Scale (OKLCH)

The site's neutral palette is an achromatic OKLCH ramp (0 chroma, 0 hue). Values below are collapsed across `inline style={}`, `style prop` variants, and Tailwind arbitrary classes.

| Value | Approx Count | Role |
|---|---|---|
| `oklch(0.65 0 0)` / `oklch(0.65_0_0)` | ~108 | Dominant secondary/muted text |
| `oklch(0.22 0 0)` | ~81 | Main border color |
| `oklch(0.28 0 0)` | ~64 | Medium-dark border, dividers |
| `oklch(0.72 0 0)` / `oklch(0.72_0_0)` | ~53 | Lighter secondary text, captions |
| `oklch(0.1 0 0)` | ~48 | Card surfaces, input backgrounds |
| `oklch(0.18 0 0)` | ~51 | Subtle borders, grid lines |
| `oklch(0.08 0 0)` | ~43 | Page background, darkest surfaces |
| `oklch(0.58 0 0)` / `oklch(0.58_0_0)` | ~31 | Tertiary text |
| `oklch(0.82 0 0)` / `oklch(0.82_0_0)` | ~26 | Near-foreground body text |
| `oklch(0.2 0 0)` | ~26 | Elevated card backgrounds |
| `oklch(0.95 0 0)` | ~21 | Primary/foreground text |
| `oklch(0.45 0 0)` | ~18 | Disabled / very dimmed text |
| `oklch(0.3 0 0)` / `oklch(0.3_0_0)` | ~18 | Placeholder text |
| `oklch(0.12 0 0)` | ~15 | Slightly lighter card bg than 0.1 |
| `oklch(0.11 0 0)` / `oklch(0.11_0_0)` | ~12 | Subtle surface variant |
| `oklch(0.55 0 0)` / `oklch(0.55_0_0)` | ~9 | Mid-tone dimmed text |

**Effective surface stack (darkest to lightest):**
```
0.07–0.08  →  page background
0.10–0.12  →  card / input background
0.14–0.18  →  elevated card, grid lines
0.20–0.22  →  borders
0.26–0.30  →  dividers, subtle separators
```

### Score Colors

Defined in `lib/score.ts`. Used by gauge and listing score badges.

| Score | Color | Label |
|---|---|---|
| ≥85 | `#4A7C59` | Excellent |
| 75–84 | `#576A8F` | Great Option |
| 65–74 | `#6B78C5` | Good Option |
| 55–64 | `#8B7BC5` | Ask Questions |
| 40–54 | `#C5A04A` | Limited/Inconsistent |
| <40 | `#FF7444` | High Risk |
| null | `#C5C8D6` | No Data |

### Signal Colors (Two Conflicting Sets)

Two pages define independent signal colors with different values:

| Signal | Homepage (`page.tsx`) | Restaurant detail (`restaurant/[slug]/page.tsx`) |
|---|---|---|
| Positive | `#4ADE80` (bright green) | `#7ECF9A` (muted green, 8 uses) |
| Warning | `#FACC15` (bright yellow) | `#D4AE62` (muted gold, 6 uses) |
| Negative | `#FF7444` | `#FF8060` (5 uses) |

---

## Typography

### Font Families

IBM Plex Mono is the dominant typeface on this site by a large margin. IBM Plex Sans is nearly absent.

| Font | Class | Count | Role |
|---|---|---|---|
| IBM Plex Mono | `font-mono` | **331** | Labels, metadata, nearly all UI text |
| Bebas Neue | `font-[family-name:var(--font-display)]` or `font-display` | **83** | Display headings, score numbers |
| IBM Plex Sans | `font-sans` | **2** | Barely present |

This is effectively a **monospace-first** design with a display accent for large headings.

### Font Sizes

Arbitrary pixel sizes dominate. Standard Tailwind scale (`text-sm`, `text-base`) is barely used.

| Size | Count | Role |
|---|---|---|
| `text-[10px]` | **132** | Primary label size — buttons, tags, metadata |
| `text-[11px]` | **127** | Slightly larger label — nav, card text |
| `text-[9px]` | 49 | Small labels, sub-metadata |
| `text-[13px]` | 28 | Body text in cards |
| `text-[12px]` | 10 | Occasional label |
| `text-[8px]` | 8 | Micro labels |
| `text-[14px]` | 7 | Input fields, paragraphs |
| `text-[15px]` | 5 | Agent message prose |
| `text-[16px]` | 2 | Blog body |
| `text-[19px]` | 1 | Isolated heading |
| `text-sm` | 4 | Almost never used |
| `text-base` | 3 | Almost never used |
| `text-2xl` | 4 | Almost never used |

**De facto type scale: 10px and 11px cover the majority of UI text.** Everything else is display headings (via `clamp()`) or one-off sizes.

### Display Heading Sizes

Bebas Neue headings use `clamp()` for fluid sizing. Most common values:

| Expression | Count | Context |
|---|---|---|
| `clamp(3rem, 8vw, 5.5rem)` | 2 | Large hero headings |
| `clamp(2rem, 6vw, 4rem)` | 3 | Section headings |
| `clamp(2.5rem, 7vw, 5rem)` | 1 | Large callout |
| `clamp(1.25rem, 3vw, 2.25rem)` | 2 | Medium headings |
| `clamp(1rem, 2vw, 1.5rem)` | 2 | Subheadings |

### Letter Spacing

All labels use wide tracking. `tracking-[0.15em]` is the default label spacing.

| Value | Count | Usage |
|---|---|---|
| `tracking-[0.15em]` | **98** | Default label / tag spacing |
| `tracking-[0.2em]` | 75 | Wider labels, nav items |
| `tracking-[0.25em]` | 32 | Extra-wide all-caps |
| `tracking-[0.1em]` | 17 | Slightly tracked body |
| `tracking-[0.18em]` | 12 | Mid-range label |
| `tracking-[0.3em]` | 12 | Most emphatic tracking |
| `tracking-[0.08em]` | 12 | Minimal tracking |

### Text Transform

`uppercase` is applied to essentially all UI labels — 263 occurrences. The site reads as all-caps mono throughout.

### Font Weights

Weights are mostly implicit (Tailwind doesn't override the default 400 unless specified). When set explicitly:

| Value | Count | Context |
|---|---|---|
| `font-semibold` | 3 | Sparse use |
| `font-bold` | 3 | Sparse use |
| `font-medium` | 1 | Rare |
| `fontWeight: 700` | 1 | Inline |
| `fontWeight: 600 : 400` | 2 | Conditional active state |

Weight is mostly left at the typeface default. Emphasis comes from size and opacity, not weight.

---

## Spacing

### Padding (Component-Level)

`px-4 py-3` and `px-3 py-2.5` are the two dominant padding patterns — button-height components and card rows respectively.

| Class | Count | Usage |
|---|---|---|
| `px-4` | **86** | Default horizontal padding |
| `py-3` | 45 | Default vertical padding |
| `py-2.5` | 45 | Compact vertical padding |
| `px-3` | 44 | Tight horizontal padding |
| `px-8` | 22 | Wide section padding |
| `py-2` | 19 | Small vertical padding |
| `px-6` | 18 | Medium-wide horizontal |
| `py-1.5` | 17 | Tight vertical |
| `py-1` | 14 | Minimal vertical |
| `px-5` | 12 | Mid horizontal |
| `p-5` | 8 | Square card padding |
| `p-6` | 6 | Larger card padding |
| `p-3` | 3 | Tight card padding |

### Gap (Layout)

`gap-2` and `gap-3` are the default flex/grid gaps — tight, dense layouts.

| Class | Count |
|---|---|
| `gap-2` | **47** |
| `gap-3` | **46** |
| `gap-4` | 18 |
| `gap-1.5` | 17 |
| `gap-2.5` | 8 |
| `gap-1` | 5 |
| `gap-6` | 3 |
| `gap-8` | 3 |
| `gap-10` | 5 |

### Margin (Vertical Rhythm)

Bottom margins `mb-4` and `mb-6` dominate section spacing.

| Class | Count |
|---|---|
| `mb-4` | 16 |
| `mb-6` | 14 |
| `mb-1` | 13 |
| `mt-2` | 12 |
| `mb-3` | 12 |
| `mb-5` | 11 |
| `mt-1` | 11 |
| `mb-2` | 10 |
| `mb-1.5` | 10 |

---

## Borders

### Border Width

`border` (1px) is universal. Border widths are never varied.

| Class | Count |
|---|---|
| `border` | **157** |
| `border-b` | 62 |
| `border-t` | 17 |
| `border-r` | 3 |
| `border-l` | 2 |

### Border Colors

Three effective border colors in use, all inline:

| Value | Count | Role |
|---|---|---|
| `oklch(0.18 0 0)` | ~66 | Subtle/secondary borders |
| `oklch(0.22 0 0)` | ~37 | Primary border (matches `--border` token) |
| `oklch(0.28 0 0)` | ~24 | Medium-emphasis borders |
| `#FF7444` or variants | ~26 | Accent-state borders |
| `oklch(0.3 0 0)` | 6 | Heavy emphasis |

---

## Border Radius

The site is **square by default** — all radius tokens are `0rem`. The only rounding present:

| Class | Count | Usage |
|---|---|---|
| `rounded-full` | 16 | Status dots, avatar circles |
| `rounded` | 6 | Isolated elements (checkboxes, tooltips) |
| `rounded-md` | 2 | Rare override |
| `rounded-t` | 2 | Top-only rounding (dropdown variant) |

---

## Opacity

Used for dimming inactive/disabled states, not for color transparency.

| Class | Count | Usage |
|---|---|---|
| `opacity-40` | **24** | Dominant — inactive/disabled elements |
| `opacity-50` | 9 | Semi-disabled |
| `opacity-70` | 2 | Mild dimming |
| `opacity-30` | 2 | More aggressive dimming |
| `opacity-0` | 2 | Hidden |
| `opacity-100` | 4 | Explicit full opacity (transition targets) |

---

## Surface Patterns

Two recurring surface treatments:

**Grid background** (`globals.css`): `60px × 60px` grid using `oklch(0.18 0 0)` lines on the page background. Applied via `.grid-bg` class.

**Noise overlay** (`globals.css`): Fixed SVG fractalNoise at `opacity: 0.035`. Sits at `z-index: 1000`, pointer-events none. Applies to the full page.

---

## What the Site Looks Like

In plain terms: a dense, dark, all-caps monospace UI. Near-black backgrounds (`oklch(0.08–0.12 0 0)`), no rounded corners except circles, text at 10–11px in IBM Plex Mono, everything uppercase with 0.15em+ letter spacing. Coral orange (`#FF7444`) is the only chromatic color except for the score/signal palette. Visual hierarchy comes from opacity and size, not weight. Layouts are tight — `gap-2`/`gap-3`, `px-4/py-3` — with no breathing room. The overall aesthetic is editorial / data-dense / terminal-adjacent.
