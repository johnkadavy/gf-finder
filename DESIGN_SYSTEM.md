# Design System — CleanPlate

## Visual Language

CleanPlate is a **dense, dark, editorial UI**. Think data terminal crossed with a magazine: high-information density, all-caps monospace labels, a single coral accent on a near-black ground, zero rounded corners. Hierarchy comes from opacity and size — not weight or color variety.

- **Dark by default, light supported.** The page background is essentially black; surfaces layer upward in lightness. A warm cream light theme (derived from the digest) ships behind a toggle — see **Theming** below. Because of that, every color *must* go through a token so it flips between themes.
- **Monospace-first.** IBM Plex Mono is the primary label font. IBM Plex Sans appears only in long-form prose.
- **All-caps always.** Nearly every UI label is uppercase with wide letter spacing.
- **One chromatic color.** Coral (`#FF7444`) is the only non-neutral brand color. Score and signal colors exist to convey data meaning, not decoration.
- **No radius.** All corners are sharp. `rounded-full` is used only for circular status dots.

---

## Theming — Light & Dark

CleanPlate ships **two themes**: the original dark (default) and a warm cream **light** theme derived from the digest email. The active theme is a `dark` or `light` class on `<html>`.

**How it works**
- `:root` holds the **dark** values (the default). `html.light` (in `app/globals.css`) overrides surfaces, text, borders, `--grid-line`, and the neutral signal tokens with the light palette. Chromatic tokens — the coral accent and the score/signal colors — carry across both themes; the muted signal *text* colors are darkened under `html.light` for contrast on cream.
- A no-flash inline script in `app/layout.tsx` sets the class before first paint: `localStorage.theme` → OS `prefers-color-scheme` → dark fallback. `ThemeToggle` (`app/components/ThemeToggle.tsx`) flips and persists it, and `color-scheme` is set per theme so native controls/scrollbars match.

**The non-negotiable rule (doubly important now):** every color goes through a token, because hardcoded colors don't flip.
- **Never** write a raw `oklch(...)` or hex in a component — it stays fixed and breaks in the other theme.
- **Never** use `text-white`, `bg-white`, or `text-black` — they don't flip. Use `text-text-primary`, `bg-surface-*`, `text-surface-base`, etc.
- Neutrals → surface/text/border tokens · data colors → signal/score tokens · brand → `--accent`.

**Light palette** (`html.light`): page `#f4f3f1`, cards `#ffffff`, borders `#ececec`/`#e2e0dd`/`#d5d2ce`, text `#111`→`#b0b0b0`, grid `#ece9e4`; accent + score/signal hues unchanged.

**Coral outline→fill buttons:** `--color-accent-foreground` is registered in `@theme` (so `text-accent-foreground` works), but these hover buttons use inline `onMouseEnter/onMouseLeave` handlers that set `backgroundColor: var(--accent)` + `color: var(--accent-foreground)` — done for reliability after a Tailwind utility-generation issue. Follow that inline pattern for new coral buttons.

---

## Color

### Token locations
- **CSS variables:** `app/globals.css` — `:root` block
- **Tailwind utilities:** `app/globals.css` — `@theme inline` block (generates `bg-*`, `text-*`, `border-*` classes)
- **JS/TS constants:** `lib/tokens.ts` — imported by components that need colors in JS expressions

---

### Accent

The single brand color. Use it for: interactive elements, active states, calls to action, highlights, links.

| Token | Value | Tailwind class |
|---|---|---|
| `--accent` | `#FF7444` | `bg-accent` / `text-accent` / `border-accent` |
| `--accent-foreground` | `oklch(0.08 0 0)` | `text-accent-foreground` |

**Accent opacity ramp** — use these instead of computing opacity manually:

| CSS var | Value | Opacity | Use case |
|---|---|---|---|
| `--accent-tint-xs` | `#FF744408` | 3% | Ghost hover hint on dark surfaces |
| `--accent-tint-sm` | `#FF744415` | 8% | Active filter pill background |
| `--accent-tint-md` | `#FF744420` | 12% | Active card background fill |
| `--accent-tint-lg` | `#FF744440` | 25% | Emphasis overlay |
| `--accent-tint-xl` | `#FF744460` | 37% | Decorative border, link underline |

```css
/* CSS */
background-color: var(--accent-tint-md);

/* Tailwind */
className="bg-accent-tint-md"
```

---

### Surface Scale

Surfaces layer upward from the page background. Never skip levels — a card on top of a card should use `elevated`, not `raised` again.

| CSS var | Value | Tailwind | Use |
|---|---|---|---|
| `--surface-base` | `oklch(0.08 0 0)` | `bg-surface-base` | Page background |
| `--surface-raised` | `oklch(0.10 0 0)` | `bg-surface-raised` | Default card / input surface |
| `--surface-elevated` | `oklch(0.12 0 0)` | `bg-surface-elevated` | Elevated card (card-on-card) |
| `--surface-overlay` | `oklch(0.16 0 0)` | `bg-surface-overlay` | Popovers, dropdown panels |

The `--background` and `--card` tokens (shadcn compatibility) alias `surface-base` and `surface-elevated` respectively.

---

### Border Scale

All borders are 1px. Use the default border for most dividers; use subtle for grid lines and structure; use emphasis when a border needs to stand out (e.g. section separator after a header row).

| CSS var | Value | Tailwind | Use |
|---|---|---|---|
| `--border-subtle` | `oklch(0.18 0 0)` | `border-border-subtle` | Grid lines, secondary dividers |
| `--border-default` | `oklch(0.22 0 0)` | `border-border` | Primary border — most dividers |
| `--border-emphasis` | `oklch(0.28 0 0)` | `border-border-emphasis` | Medium-emphasis separators |
| `--grid-line` | `oklch(0.18 0 0)` | — | `.grid-bg` texture only — tuned per theme, not a general border |

---

### Text Scale

Text lightness tracks perceived importance. The most common label color is `--text-label` (~65% lightness). Use `--text-primary` sparingly — mostly for active/focused states and headings.

| CSS var | Value | Tailwind | Use |
|---|---|---|---|
| `--text-primary` | `oklch(0.95 0 0)` | `text-text-primary` | Primary reading text, active headings |
| `--text-secondary` | `oklch(0.82 0 0)` | `text-text-secondary` | Body copy, article text |
| `--text-tertiary` | `oklch(0.72 0 0)` | `text-text-tertiary` | Captions, secondary metadata |
| `--text-label` | `oklch(0.65 0 0)` | `text-text-label` | **Default label color** — most UI text |
| `--text-dim` | `oklch(0.58 0 0)` | `text-text-dim` | Sub-labels, de-emphasized metadata |
| `--text-disabled` | `oklch(0.45 0 0)` | `text-text-disabled` | Inactive / placeholder |

---

### Signal Colors

Used for data sentiment indicators: safety signals, review breakdowns, dietary confidence levels. These colors carry meaning — do not use them decoratively.

**Text / icon / dot colors** (muted, designed for labels and borders):

| CSS var | Value | Meaning |
|---|---|---|
| `--signal-positive` | `#7ECF9A` | Confirmed safe, good practice |
| `--signal-warning` | `#D4AE62` | Caution, inconsistent, ask questions |
| `--signal-negative` | `#FF8060` | High risk, bad practice, avoid |
| `--signal-neutral` | `oklch(0.72 0 0)` | Neutral / informational |

**Background fills** (very low opacity — `~3%`):

| CSS var | Value |
|---|---|
| `--signal-bg-positive` | `#4A7C590D` |
| `--signal-bg-warning` | `#C5A04A0D` |
| `--signal-bg-negative` | `#FF74440D` |
| `--signal-bg-neutral` | `oklch(0.095 0 0)` |

**Borders** (`~22%` opacity):

| CSS var | Value |
|---|---|
| `--signal-border-positive` | `#4A7C5938` |
| `--signal-border-warning` | `#C5A04A38` |
| `--signal-border-negative` | `#FF744438` |
| `--signal-border-neutral` | `oklch(0.18 0 0)` |

**JS access:** `import { SIGNAL_COLORS, SIGNAL_BG, SIGNAL_BORDER } from "@/lib/tokens"`

**Homepage chip dots** use a brighter set (`SIGNAL_DOT` from `lib/tokens.ts`) because they render at 6px and need contrast at that size.

---

### Score Colors

Applied programmatically by `getGaugeColor()` and `getScoreLabel()` in `lib/score.ts`. Do not use these in static UI — they exist exclusively for the numeric score badge and gauge ring.

| CSS var | JS key | Value | Score range |
|---|---|---|---|
| `--score-excellent` | `SCORE_COLORS.excellent` | `#4A7C59` | ≥85 |
| `--score-great` | `SCORE_COLORS.great` | `#576A8F` | 75–84 |
| `--score-good` | `SCORE_COLORS.good` | `#6B78C5` | 65–74 |
| `--score-caution` | `SCORE_COLORS.caution` | `#8B7BC5` | 55–64 |
| `--score-limited` | `SCORE_COLORS.limited` | `#C5A04A` | 40–54 |
| `--score-risk` | `SCORE_COLORS.risk` | `#FF7444` | <40 |
| `--score-no-data` | `SCORE_COLORS.noData` | `#9AA5BE` | null |

**JS access:** `import { SCORE_COLORS } from "@/lib/tokens"`  
**Score functions:** always go through `getGaugeColor(score)` or `getScoreLabel(score)` — never inline score colors in components.

---

## Typography

### Font Families

| Font | CSS var | Tailwind | Role |
|---|---|---|---|
| IBM Plex Mono | `--font-mono` | `font-mono` | **Primary UI font** — all labels, metadata, buttons |
| Bebas Neue | `--font-display` | `font-[family-name:var(--font-display)]` | Display headings, score numbers |
| IBM Plex Sans | `--font-sans` | `font-sans` | Long-form prose only (blog, agent chat) |

Use `font-mono` by default for any UI text. Reserve `font-sans` for paragraph-length reading contexts.

---

### Type Scale

All sizes are in `app/globals.css` as `--font-size-*` vars. Current de facto scale, in order of frequency:

| CSS var | Value | Tailwind | Use |
|---|---|---|---|
| `--font-size-2xs` | `8px` | — | Micro labels (use sparingly — at accessibility limit) |
| `--font-size-xs` | `9px` | — | Small sub-labels, tag text |
| `--font-size-sm` | `10px` | — | **Default label** — most buttons, tags, metadata |
| `--font-size-md` | `11px` | — | Slightly larger label — nav, card body |
| `--font-size-lg` | `13px` | — | Card body text, input helper text |
| `--font-size-xl` | `14px` | — | Input fields, form labels |
| `--font-size-2xl` | `15px` | — | Agent / chat prose |
| `--font-size-body` | `16px` | — | Blog body |

**Display headings** (Bebas Neue) use fluid `clamp()` sizing — see the display heading patterns below.

The Tailwind arbitrary classes currently in the codebase (`text-[10px]`, `text-[11px]`) should migrate to `style={{ fontSize: "var(--font-size-sm)" }}` or, once Tailwind `@theme` mappings are added for them, to utility classes.

---

### Display Heading Patterns

Bebas Neue headings use `clamp()` so they scale between breakpoints. Common patterns:

| Context | Expression |
|---|---|
| Hero / page title | `clamp(3.5rem, 10vw, 7rem)` |
| Large section heading | `clamp(3rem, 8vw, 5.5rem)` |
| Standard section | `clamp(2rem, 6vw, 4rem)` |
| Card heading | `clamp(1.5rem, 4vw, 1.9rem)` |

---

### Letter Spacing

Nearly all UI text is uppercase with wide tracking. `--letter-spacing-label` is the default.

| CSS var | Value | Tailwind | Use |
|---|---|---|---|
| `--letter-spacing-snug` | `0.08em` | `tracking-snug` | Minimal extra tracking |
| `--letter-spacing-normal` | `0.10em` | — | Light tracking |
| `--letter-spacing-label` | `0.15em` | `tracking-label` | **Default label** |
| `--letter-spacing-wide` | `0.18em` | `tracking-broad` | Mid-range labels |
| `--letter-spacing-wider` | `0.20em` | `tracking-editorial` | Nav items, emphasis labels |
| `--letter-spacing-widest` | `0.25em` | `tracking-stamp` | Maximum emphasis |

The Tailwind classes `tracking-snug`, `tracking-label`, `tracking-broad`, `tracking-editorial`, `tracking-stamp` are registered in `@theme inline`. The old arbitrary classes (`tracking-[0.15em]`) should migrate to these.

---

### Text Transform

Always use `uppercase` for UI labels. `lowercase` and `capitalize` are essentially unused.

---

## Spacing

### Component Padding

`px-4 py-3` is the default interactive element (button, row, chip). `px-3 py-2.5` is the compact variant.

| Pattern | Use |
|---|---|
| `px-4 py-3` | Default button / row / pill |
| `px-3 py-2.5` | Compact row |
| `px-4 py-1.5` | Tight chip / badge |
| `p-5` | Card body (generous) |
| `p-3` | Card body (tight) |
| `px-8` | Wide section horizontal padding |

### Layout Gap

`gap-2` and `gap-3` are the defaults for flex and grid layouts. This is intentionally tight — the design is dense.

| Value | Use |
|---|---|
| `gap-1.5` | Icon + label pairs, dot + text |
| `gap-2` | **Default** — most flex rows |
| `gap-3` | Slightly looser rows |
| `gap-4` | Card-level layout |
| `gap-6` / `gap-8` | Section-level layout |

### Section Vertical Rhythm

| Value | Use |
|---|---|
| `mb-1` / `mb-2` | Between sub-items in a group |
| `mb-3` / `mb-4` | Between groups within a section |
| `mb-5` / `mb-6` | Between major sections |
| `pt-16` / `py-16` | Page-level section top/bottom padding |

---

## Borders & Radius

### Borders

All borders are `1px solid`. Color determines emphasis level — see the Border Scale above. Apply with Tailwind `border` + inline `borderColor: "var(--border-*)"`, or use the Tailwind `border-border-*` classes.

Border directions used most: `border-b` (row dividers), `border` (card outlines), `border-t` (section tops).

### Radius

The design system is **zero-radius by default.** All `--radius-*` tokens are `0rem`.

| Pattern | Use |
|---|---|
| No class (sharp) | **Default** — all cards, buttons, inputs |
| `rounded-full` | Circular status dots, avatar circles |
| `rounded` (2px) | Code inline blocks only |

Do not add rounded corners to new components without explicit design sign-off. The sharp aesthetic is intentional.

---

## Opacity

Opacity communicates state, not depth. It is never used for color transparency (use the accent tint ramp or signal bg vars instead).

| Value | Use |
|---|---|
| `opacity-40` | **Default inactive** — disabled elements, non-focus items |
| `opacity-50` | Semi-disabled |
| `opacity-70` | Mildly dimmed |
| `opacity-0` / `opacity-100` | Animation start/end states |

---

## Surface Textures

Two ambient textures applied globally at the layout level:

**Grid background** (`.grid-bg`): `60px × 60px` rule grid using the `--grid-line` token. This token is separate from `--border-subtle` so the grid can be tuned per theme — in light it's a faint warm gray (`#ece9e4`) so the texture whispers on cream instead of shouting. Applied to full-bleed background sections.

**Noise overlay** (`.noise-overlay`): Fixed SVG fractal noise at `opacity: 0.035`. Applied in the root layout. Sits at `z-index: 1000` with `pointer-events: none`.

---

## Quick Reference: When to Use What

| I need to... | Use |
|---|---|
| Color an interactive button | `--accent` / `bg-accent` |
| Tint a background on hover | `--accent-tint-xs` or `--accent-tint-sm` |
| Color an active filter chip | `--accent-tint-sm` bg + `--accent` border |
| Show a positive signal | `--signal-positive` text + `--signal-bg-positive` bg + `--signal-border-positive` border |
| Color a score badge | `getScoreLabel(score).color` or `getGaugeColor(score)` |
| Write a UI label | `font-mono text-[10px] uppercase tracking-[0.15em]` (migrate to `var(--font-size-sm)` + `tracking-label`) |
| Set a card background | `--surface-raised` |
| Divide two sections | `border-b` with `--border-default` |
| Dim an inactive element | `opacity-40` |
| Write body paragraph text | `font-sans` + `--text-secondary` |
| Write a display heading | `font-[family-name:var(--font-display)]` + `clamp()` font size |
