# CleanPlate — Mobile Optimization Brief

_Last updated: 2026-09-25 · Handoff context for a dedicated mobile pass across the site. Read alongside [DESIGN_BRIEF.md](./DESIGN_BRIEF.md) and DESIGN_SYSTEM.md._

## Why this matters
Mobile is a large share of CleanPlate's traffic, but the experience was built desktop-first and several surfaces are underserved on small screens. For a GF/celiac diner deciding "is this safe / are there good options?" on their phone, often standing outside a restaurant, mobile IS the product. Treat these pages **mobile-first**, not desktop-with-mobile-bolted-on.

## Do this first: ground it in data
Before redesigning, pull the numbers — don't guess at priorities.
- **PostHog** + **Vercel Analytics** are both wired up.
- Find: which pages carry the most mobile traffic, and where mobile users drop off / bounce.
- Fix the high-traffic, high-friction surfaces first. A painful homepage search matters far more than a rarely-hit landing page.

## Known problem areas (from the founder, not yet audited)
1. **Homepage search experience** — the biggest concern. Search is the front door on mobile; audit the input, results, filters, and keyboard/scroll behavior.
2. **Landing pages** (e.g. `/gluten-free/[...slug]` city/neighborhood pages) — layout not optimized for mobile.
3. **Rankings pages** (`/rankings`, `RankedList`) — dense tabular/list content that needs a mobile-appropriate treatment.

## What's already done (restaurant detail page, `app/restaurant/[slug]/page.tsx`)
A full mobile pass landed here — use it as the reference pattern for the rest of the site:
- **Hero reorder**: name → compact score gauge → verdict → summary → highlights on mobile (was gauge-first). Responsive `hero` gauge size in `SafetyGauge.tsx` (~160px mobile / 224px desktop).
- **CTAs**: secondary actions (Directions/Call/Website) icon-only on mobile via `sr-only md:not-sr-only` (keeps the accessible name); primary/branded actions (Reserve, Order Online) stay labeled. "Save" was removed from the row (server plumbing left intact for easy re-add).
- **Fixed bottom nav** (`app/components/Nav.tsx`, `md:hidden`): content must clear it — add bottom padding including `env(safe-area-inset-bottom)` on the last section of any page.
- **Signal tiles**: tightened padding + value size; value beside description on one row on mobile, stacked on desktop.
- **Reviews gating**: empty-state + add-review form only render for signed-in visitors, behind Suspense so the auth check never blocks the page shell. Anonymous + no reviews → section hidden.

## Design-system constraints (carry these into every mobile change)
- **Tokens only** — never raw hex/oklch in components; use CSS var tokens (`--text-*`, `--border-*`, `--surface-*`, `--accent`). Centralized hex lives only in `lib/tokens.ts`.
- **Type**: IBM Plex Mono, IBM Plex Sans, Bebas Neue (display). Principle established this cycle — **mono for chrome (labels, section headers, metadata), sans for reading content (descriptions, body prose)**. Mono body copy hurts legibility at mobile sizes.
- **Hard corners** (radius 0), coral accent `#FF7444`, light/dark via `data-theme` toggle — every change must work in both themes.
- **Section layout**: the restaurant page uses full-width sections with labels on top (the 200px label rail was retired). Section labels are `font-mono text-ui-sm font-medium uppercase tracking-label` in `text-tertiary`.

## Mobile best-practices checklist
- Touch targets ≥ 44px.
- Respect `env(safe-area-inset-*)` (notches, home indicator) — especially around the fixed bottom nav.
- Keep the most decision-relevant content above the fold (identity + verdict + key signals).
- Constrain reading measures; avoid mono for running text.
- Prefer native inputs / avoid spurious form validation firing on load.
- Test at 390px (iPhone) and a small Android width; check both themes.

## Working method (what worked well this cycle)
Brief → reference set → audit → **disposable full-page mockup at phone width** (align on look before coding) → implement once in the component → type-check (`npx tsc --noEmit`) → verify on a real device. Iterate in the mockup, not the live code.
