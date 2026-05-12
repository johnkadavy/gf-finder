# Design Debt

Values used in components that bypass the token system. These work fine today — fixing them is a maintenance concern, not a bug. Tackle by file when touching that area anyway.

Tokens are now defined in `app/globals.css` (CSS vars) and `lib/tokens.ts` (JS constants). The patterns to replace are documented in `DESIGN_SYSTEM.md`.

---

## 1. Hardcoded `#FF7444` — use `var(--accent)`

41+ direct uses of the accent hex across 7 files. `--accent` already exists; these just don't use it.

| File | Approx count | Pattern |
|---|---|---|
| `app/page.tsx` | 13 | `style={{ color: "#FF7444" }}`, `style={{ backgroundColor: "#FF7444" }}` |
| `app/gluten-free/[...slug]/page.tsx` | 8 | Inline styles and `border-[#FF7444]` classes |
| `app/components/Nav.tsx` | 3 | Lines 86, 105, 118 |
| `app/ask/AskPage.tsx` | 4 | Lines 57, 93, 95 and nearby |
| `app/components/HomeAskInput.tsx` | 1 | Submit button background |
| `app/components/LocationBanner.tsx` | 2 | Button border + text |
| `app/components/TopRatedSection.tsx` | 3 | Lines 49, 114–116 |

**Fix:** Replace `"#FF7444"` with `"var(--accent)"` in inline styles, or `border-[#FF7444]` with `border-accent` in class strings. Pair with `var(--accent-foreground)` for text-on-accent surfaces.

---

## 2. Hardcoded accent opacity variants — use `var(--accent-tint-*)`

Six opacity variants of `#FF7444` appear as hardcoded hex strings throughout the codebase. The tint ramp is now in `--accent-tint-xs` through `--accent-tint-xl`.

| Value | CSS var | Files |
|---|---|---|
| `#FF744408` | `--accent-tint-xs` | Various |
| `#FF744415` | `--accent-tint-sm` | `app/page.tsx`, `app/rankings/RankingsFilters.tsx` |
| `#FF744420` | `--accent-tint-md` | `app/page.tsx`, `app/ask/AskPage.tsx` |
| `#FF744440` | `--accent-tint-lg` | Various |
| `#FF744460` | `--accent-tint-xl` | `app/globals.css` (agent-message link), various |
| `#FF744410` | *(between xs and sm)* | Various — use `--accent-tint-xs` or `--accent-tint-sm` |
| `#FF744412` | *(between xs and sm)* | Various — use `--accent-tint-xs` |
| `#FF744430` | *(between md and lg)* | Various — use `--accent-tint-md` or `--accent-tint-lg` |
| `#FF744450` | *(between lg and xl)* | Various — use `--accent-tint-lg` |

**Fix:** Replace hardcoded hex with `var(--accent-tint-*)` in inline styles. Closest match is fine — exact opacity precision here is not meaningful.

---

## 3. Inline OKLCH values — use named CSS vars

~200 occurrences across 8+ files where OKLCH values are inlined in `style={}` props or Tailwind arbitrary classes instead of using `var(--*)` tokens. Most common offenders:

| Hardcoded value | Replace with | Count |
|---|---|---|
| `oklch(0.08 0 0)` | `var(--surface-base)` | ~43 |
| `oklch(0.10 0 0)` | `var(--surface-raised)` | ~48 |
| `oklch(0.12 0 0)` | `var(--surface-elevated)` | ~15 |
| `oklch(0.18 0 0)` | `var(--border-subtle)` | ~51 |
| `oklch(0.22 0 0)` | `var(--border-default)` | ~81 |
| `oklch(0.28 0 0)` | `var(--border-emphasis)` | ~64 |
| `oklch(0.95 0 0)` | `var(--text-primary)` | ~21 |
| `oklch(0.82 0 0)` | `var(--text-secondary)` | ~26 |
| `oklch(0.72 0 0)` | `var(--text-tertiary)` | ~53 |
| `oklch(0.65 0 0)` | `var(--text-label)` | ~108 |
| `oklch(0.58 0 0)` | `var(--text-dim)` | ~31 |
| `oklch(0.45 0 0)` | `var(--text-disabled)` | ~18 |

Values that don't map exactly (e.g. `oklch(0.11 0 0)`, `oklch(0.17 0 0)`) — use the nearest token. If the difference is intentional (e.g. a one-off darker card in a specific context), leave a comment explaining why.

**Heaviest files:**
- `app/page.tsx` — 40+ inline OKLCH values
- `app/rankings/RankingsFilters.tsx` — 15+
- `app/ask/AskPage.tsx` — 10+
- `app/components/TopRatedSection.tsx` — 8+
- `app/components/SafetyGauge.tsx` — 5+

---

## 4. Tailwind arbitrary text-color classes — use CSS var in style prop

Many components use `text-[oklch(0.65_0_0)]` as a Tailwind arbitrary class. These should become `style={{ color: "var(--text-label)" }}` or, once a proper `--color-*` mapping is confirmed working, `className="text-text-label"`.

Most common arbitrary text-color classes:

| Class | Replace with |
|---|---|
| `text-[oklch(0.65_0_0)]` | `text-text-label` or `style={{ color: "var(--text-label)" }}` |
| `text-[oklch(0.58_0_0)]` | `text-text-dim` |
| `text-[oklch(0.72_0_0)]` | `text-text-tertiary` |
| `text-[oklch(0.82_0_0)]` | `text-text-secondary` |
| `text-[oklch(0.45_0_0)]` | `text-text-disabled` |
| `text-[oklch(0.68_0_0)]` | `text-text-dim` (closest) |

---

## 5. Arbitrary font-size classes — use `var(--font-size-*)`

All `text-[Xpx]` classes should reference the type scale token instead:

| Current | Token | Value |
|---|---|---|
| `text-[8px]` | `--font-size-2xs` | 8px |
| `text-[9px]` | `--font-size-xs` | 9px |
| `text-[10px]` | `--font-size-sm` | 10px — 132 uses |
| `text-[11px]` | `--font-size-md` | 11px — 127 uses |
| `text-[13px]` | `--font-size-lg` | 13px |
| `text-[14px]` | `--font-size-xl` | 14px |
| `text-[15px]` | `--font-size-2xl` | 15px |
| `text-[16px]` | `--font-size-body` | 16px |

**Fix:** `className="text-[10px]"` → `style={{ fontSize: "var(--font-size-sm)" }}`

High-volume: `text-[10px]` (132 uses) and `text-[11px]` (127 uses) together account for ~84% of all UI text sizes.

---

## 6. Arbitrary letter-spacing classes — use `tracking-label` etc.

`tracking-[0.15em]` is the most common (98 uses) and should become `tracking-label`. The full mapping:

| Current | Token class | Count |
|---|---|---|
| `tracking-[0.08em]` | `tracking-snug` | 12 |
| `tracking-[0.15em]` | `tracking-label` | 98 |
| `tracking-[0.18em]` | `tracking-broad` | 12 |
| `tracking-[0.20em]` | `tracking-editorial` | 75 |
| `tracking-[0.25em]` | `tracking-stamp` | 32 |
| `tracking-[0.10em]` | *(--letter-spacing-normal, no Tailwind class yet)* | 17 |
| `tracking-[0.30em]` | *(wider than stamp — no token)* | 12 |
| `tracking-[0.12em]` | *(between snug and label — use label)* | 8 |

---

## 7. `globals.css` prose blocks — use CSS vars

The `.blog-prose` and `.agent-message` CSS blocks in `app/globals.css` still use hardcoded OKLCH values and `#FF7444` directly. These are fine to leave last since they're in the stylesheet, not component code — but they should eventually reference tokens:

- `color: oklch(0.82 0 0)` → `color: var(--text-secondary)`
- `color: #FF7444` → `color: var(--accent)`
- `border-left: 2px solid #FF7444` → `border-left: 2px solid var(--accent)`
- `background: oklch(0.14 0 0)` → `background: var(--surface-overlay)` (approximately)
- `border-top: 1px solid oklch(0.22 0 0)` → `border-top: 1px solid var(--border-default)`

---

## Non-debt (acceptable hardcoding)

These use hardcoded values intentionally and should **not** be changed:

- `app/restaurant/[slug]/opengraph-image.tsx` — OG image generation. Colors must be embedded literals; CSS vars don't apply.
- `app/globals.css` `:root` block — this IS the token definition; the values here are correct.
- `lib/tokens.ts` — this IS the token definition.
- `clamp()` display heading expressions — no token system for fluid type; context-specific by design.
