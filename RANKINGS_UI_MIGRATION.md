# Rankings UI → /gluten-free pages — Migration Plan

## Goal
The `/gluten-free/[...slug]` SEO pages keep their URLs, metadata, JSON-LD, and follow prompts — but render the rankings-page list UI instead of `IndexTable`. No redirects; the SEO surface stays exactly where Google already ranks it.

## Why not redirect to /rankings
Filtered `/rankings?...` URLs canonicalize to bare `/rankings` (correct today). Redirecting SEO pages there would discard clean crawlable URLs and consolidate everything onto one generic page. The UI is what should move, not the URLs.

## Current state

| | `/rankings` | `/gluten-free/...` |
|---|---|---|
| List UI | `RankingsList` (rank number, display name, hover accent, summary, ScoreBadge, New badge, Load More) | `IndexTable` (table) or editorial cards, chosen by result count |
| Data fetch | Inside `RankingsList` via `Filters` + access control (`getCityAccess`) | In the page itself (public client, `score ≥ 75`, limit 100, 404 under 5 results) |
| Signup capture | none | `FollowPrompt` — section variant below list + in-table row variant |
| SEO | canonical → bare `/rankings` | self-canonical, sitemap, JSON-LD, editorial intro, StatStrip |

`RankingsList` is coupled to the rankings route: it fetches its own data, takes `Filters`/`isAdmin`/`allowedCities`, and builds Load More links with `rankingsUrl()`.

## Steps

### 1. Extract a shared presentational component (no visual change)
Create `app/components/RankedList.tsx`: a pure server component that takes data and renders the rankings look.

```ts
type RankedListProps = {
  restaurants: RankedRestaurant[];   // id, name, display_name, slug, neighborhood, city, region, score, dossier, source, ingested_at
  totalCount: number;
  contextLabel?: string;             // "— West Village" suffix in the count header
  loadMoreHref?: string;             // omit to hide Load More (gluten-free pages)
  inlineSlot?: { afterRow: number; node: ReactNode };  // for the in-list follow prompt
};
```

Move the row markup, count header, skeleton, and empty state out of `RankingsList` into it. `RankingsList` becomes: fetch (unchanged, keeps access control) → `<RankedList …loadMoreHref={rankingsUrl(...)} />`. Verify `/rankings` is pixel-identical before proceeding.

### 2. Swap the table layout on ONE /gluten-free page
In the city-level category branch, replace `IndexTable` with `RankedList` (keep `StatStrip` above it — it's content, not chrome). Keep:
- the section-level `FollowPrompt` below the list
- the in-list capture: pass the row-variant follow prompt via `inlineSlot` (around row 10, matching today's in-table placement)
- JSON-LD, breadcrumbs, hero, editorial intro — untouched

Compare against `/rankings?city=New+York` side by side at 375px / 768px / 1280px. This page is the review gate.

### 3. Roll out to remaining branches
- Neighborhood pages (with and without category suffix)
- Keep the editorial layout branch for small result sets (<8) as is — the table/editorial split by count stays; only the table half changes
- Delete `IndexTable.tsx` once nothing imports it

### 4. Canonical refinement (optional, separate commit)
In `app/rankings/page.tsx` `generateMetadata`: when the active filters map exactly to an existing `/gluten-free` page (city+neighborhood, or city+category), set the canonical to that URL instead of bare `/rankings`. Consolidates shared/linked filter URLs toward the SEO pages.

### 5. Verify
- `npx tsc --noEmit`
- Grep touched files for `#[0-9a-fA-F]`, `oklch(`, `text-\[`, `tracking-\[` (design-system rule)
- JSON-LD still validates (Rich Results test on one category + one neighborhood page)
- FollowPrompt impression/submit instrumentation still fires from both variants
- No CLS: RankedList is server-rendered like IndexTable, so no layout shift expected — confirm with one Lighthouse run on a category page

## Risks / notes
- `RankedList` must not import anything from `app/rankings/utils` (avoids coupling the SEO page to rankings filter logic). Keep `rankingsUrl()` calls in `RankingsList` only.
- The gluten-free query selects a narrower column set than `RankingsList` — align the select list when swapping (add `display_name, region, source, ingested_at` where missing).
- Rank numbers on SEO pages are a small content change (table had them too — confirm). Google reacts to content changes; expect minor ranking noise for a week or two, not a structural risk.
- Effort: ~M. Step 1 is the bulk; steps 2–3 are mostly deletions.
