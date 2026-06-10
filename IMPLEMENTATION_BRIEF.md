# GF Bakery Index — Rankings Table Implementation Brief

## What this is
A redesign of the gluten-free rankings page (`/gluten-free/[...slug]` for the
bakery category, e.g. `/gluten-free/new-york/bakery`). Replaces the flat 25-row
list with a data-table treatment that frames the rankings as a measured Index.

**Visual reference:** `docs/mocks/gf-index-table.html` — open this in a browser
and read the markup/CSS. It is throwaway prototype code (inline styles, hardcoded
rows). Do NOT copy it verbatim. Use it for layout, hierarchy, and spacing intent
only. All styling must go through our existing design tokens (see DESIGN_SYSTEM.md
and CLAUDE.md), not the literal hex/oklch values in the mock.

## Layout selection — which layout a page gets
We have TWO layouts for ranked content, and the choice is driven by entry count
and page intent, NOT by the URL/route:

- **Table layout (THIS task)** — for comprehensive ranked sets the user scans,
  sorts, and acts on. Long lists (roughly 8+ entries), score-driven, where the
  comparison is the point. Examples: broad category/region rankings like
  `/gluten-free/new-york/bakery`, "GF pizza in NYC", category landing pages.

- **Editorial layout (already exists / separate)** — for narrow, curated, or
  narrative slices with few entries (roughly under 8). Prose-forward, where the
  *why* matters more than head-to-head comparison. Examples: a single-neighborhood
  view like `/rankings?region=New+York+City&neighborhood=Downtown+Brooklyn`, or any
  small-market category (early SF, Long Island) that only has a handful of places.

**Rule of thumb:** under ~8 entries OR a curated/narrative slice → editorial;
~8+ in a comprehensive ranked set → table. A page can flip layouts based on how
many results its query returns, so don't hardcode layout to a route — decide from
result count + a page-level intent flag if one exists.

### Shared atoms (IMPORTANT — build these as standalone components)
Both layouts must render an individual place identically. Extract these as
reusable components used by BOTH the table rows and the editorial cards, so a place
looks the same in either container and we maintain one source of truth:
- Score badge (number + color tier + label)
- Kitchen-status tag (dedicated / shared-careful)
- Data-confidence indicator
- Actions (directions deep-link + website icon)

Only the CONTAINER differs (table row vs. editorial card); the atoms are shared.
For THIS task, build the atoms + the table container. The editorial container
already exists / is a separate task — but build the atoms cleanly enough that the
editorial layout can adopt them with minimal change. Flag if the existing editorial
layout has its own divergent versions of these atoms that should be reconciled.

## Scope of THIS task
Desktop layout only. Build the table structure, the stat strip, the neighborhood
filter, and per-row actions. Mobile/responsive is a SEPARATE follow-up task — do
not attempt it here. Describe your plan before writing code.

## Page structure (top to bottom)
1. Breadcrumb / kicker (mono, faint) — reuse existing component if one exists.
2. Display headline + lede paragraph — reuse existing heading styles.
3. **Stat strip** — 3 equal columns, hairline dividers:
   - Bakeries rated (total count for this page's filter set)
   - Dedicated GF kitchens (count where kitchen_status = dedicated)
   - Scored excellent · 85+ (count where gf_safety_score >= 85), accent green
4. **Filter row** — single neighborhood dropdown (details below).
5. **Ranking table** — columns: rank #, name+neighborhood, kitchen status,
   data confidence, actions, GF safety score (sortable, default desc).

## Data contract — CONFIRM each field before building
For each, I've marked what I believe the status is. Verify against the schema and
flag anything wrong BEFORE coding. If a field doesn't exist, stub it with a clearly
labeled TODO rather than faking values in the component.

- `rank` — derived from sort order. Real.
- `name`, `neighborhood`, `borough` — real, in Places data.
- `gf_safety_score` (int 0–100) — real. Drives the number + color tier
  (>=96 excellent green; 85–95 "strong" yellow-green; <85 TBD).
- `kitchen_status` — enum: "dedicated" | "shared_careful". CONFIRM this field
  exists. If it's currently derived from enrichment text, we need a clean column.
- `data_confidence` — high | medium | low. LIKELY DOES NOT EXIST YET. This should
  be computed from evidence (e.g. number of verified reports, recency, source
  agreement). For now: stub the column, render a placeholder, and leave a TODO with
  the intended derivation. Do not invent per-row values.
- `directions_url` — build a maps deep link from lat/lng:
  `https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`. Real (we have coords).
- `website_url` — real if present in Places data; hide the icon if null.
- Neighborhood counts in the dropdown — computed at render from the result set,
  not hardcoded.

## Neighborhood filter
Native `<select>`, grouped by borough via `<optgroup>`, with per-neighborhood
counts computed live. Default option "All neighborhoods · <total>". Selecting
filters the table client-side (data's already loaded). Accessible label.
Do NOT rebuild as pill buttons or add a name-search input — both were removed
deliberately.

## Explicitly OUT of scope / removed (don't add back)
- Cuisine/"Type" column — removed; replaced by the actions column.
- "Filter by name" search input — removed.
- Pill-style neighborhood filters — replaced by the dropdown.
- "Perfect score" and "median score" stats — removed.

## Definition of done
- Renders from real query data, not the mock's sample rows.
- Sort by score works (header click, default desc).
- Neighborhood dropdown filters correctly with live counts.
- Directions deep-links to maps; website icon hidden when no URL.
- All colors/spacing/fonts via design tokens; no literal values from the mock.
- data_confidence left as a clearly-marked stub with a TODO.
