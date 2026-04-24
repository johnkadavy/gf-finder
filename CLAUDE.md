# CleanPlate — CLAUDE.md

## What this is
CleanPlate is a gluten-free restaurant discovery and safety-ranking app. Restaurants are scored 0–100 for GF safety based on reviews, menu labeling, and operational practices. The main surfaces are a ranked list page and an interactive map.

## Stack
- **Framework**: Next.js 16 App Router, React 19, TypeScript
- **Styling**: Tailwind CSS v4
- **Database**: Supabase (PostgreSQL) — public client for reads, service role for scripts
- **Map**: Mapbox GL JS via `react-map-gl`
- **Enrichment pipeline**: Airtable (AI fields) + Anthropic Claude API
- **Deployment**: Vercel

## Dev commands
```bash
npm run dev          # local dev server
npx tsc --noEmit     # type check (run before committing)
npx tsx scripts/...  # run any pipeline script
```

## Supabase clients — use the right one

| Context | Import | When |
|---|---|---|
| Server Components / Route Handlers | `createClient` from `@/lib/supabase-server` | User-authenticated reads |
| Scripts (`scripts/`) | `createClient` from `@supabase/supabase-js` with `SUPABASE_SERVICE_ROLE_KEY` | Writes, backfills, full access |
| Public read-only | `supabase` from `@/lib/supabase` | Rankings page, map search (public data) |
| Browser Client Components | `createBrowserClient` from `@/lib/supabase-browser` | Auth state, saved restaurants |

Never use `SUPABASE_SERVICE_ROLE_KEY` in app code — scripts only.

## Geographic hierarchy

```
region ("New York City", "Long Island")
  └─ city ("New York", "Huntington")
       └─ neighborhood ("West Village", "Chelsea", ...)
```

- **NYC**: single-city region → show neighborhood selector
- **Long Island**: multi-city region → show town (city) selector, no neighborhood
- Logic lives in `app/rankings/page.tsx`: `isMultiCityRegion = regionCities.length > 1`
- `REGION_MAP` in `scripts/backfill-regions.ts` maps city → region

## Access control
- All city access gates through `getCityAccess()` in `lib/cities.ts`
- Default (unauthenticated): NYC only
- User profile (`profiles` table): `allowed_cities`, `default_city`, `is_admin`
- Admins bypass all city restrictions
- **Do not change `lib/cities.ts`** unless specifically working on access control

## Scoring model (`lib/score.ts`)
Weights: **Reviews 45% | Menu 35% | Operations 20%**

Key inputs from the dossier (JSONB in `restaurants.dossier`):
- `reviews.recent_sentiment`, `positive_count`, `negative_count`, `sick_reports_recent`, `recency_coverage`
- `menu.gf_labeling` (clear/partial/none), `gf_options_level`
- `operations.staff_knowledge`, `cross_contamination_risk`, `dedicated_equipment.fryer`
- `data_quality.confidence` nudges score toward 50 (low confidence → less extreme)

`verifiedData` (scraped signals) overrides the AI dossier for `gf_labeling`.

## Ingest pipeline (adding a new neighborhood/city)

```bash
# 1. Set up neighborhood + get Claude's street suggestions
npx tsx scripts/setup-neighborhood.ts --neighborhood "West Village" --city "New York" --state "NY" --region "New York City"

# 2. Review/edit streets in Supabase: neighborhood_streets table

# 3. Ingest restaurants from Google Places
npx tsx scripts/ingest-neighborhood.ts --neighborhood "West Village" --city "New York" --region "New York City"

# 4. Push new restaurants to Airtable (AI enrichment happens there)
npx tsx scripts/populate-airtable.ts --neighborhood "West Village" --city "New York"

# 5. Wait for Airtable AI fields to finish, then sync back to Supabase
npx tsx scripts/sync-airtable.ts

# 6. Backfill scores if needed
npx tsx scripts/backfill-scores.ts
```

## Key files

| File | Role |
|---|---|
| `lib/score.ts` | Scoring model — `calculateScore()`, score labels, gauge colors |
| `lib/cities.ts` | City access control — `getCityAccess`, `resolveCity` |
| `lib/cuisine.ts` | `normalizeCuisine()` — maps raw DB values to canonical categories |
| `app/rankings/page.tsx` | Rankings page — queries, filter derivation, region model |
| `app/rankings/RankingsFilters.tsx` | Filter UI components |
| `app/rankings/utils.ts` | `Filters` type, `rankingsUrl()` serializer |
| `app/map/MapView.tsx` | Interactive map — all map state, search, filter logic |
| `app/map/MapViewLoader.tsx` | Dynamic import wrapper for MapView (ssr:false) |
| `scripts/sync-airtable.ts` | Reads Airtable dossiers, calculates scores, writes to Supabase |
| `scripts/ingest-neighborhood.ts` | Google Places → Supabase restaurants |

## Cuisine normalization
Raw DB values (e.g. "Italian (Pizza & Pasta)", "Italian / Casual") normalize to canonical categories ("Italian") via `normalizeCuisine()` in `lib/cuisine.ts`. Both the rankings filter and map search use canonical values — always go through `normalizeCuisine` when comparing or filtering by cuisine.

## Env vars (`.env.local`)
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY       # scripts only, never app code
GOOGLE_MAPS_API_KEY
AIRTABLE_API_KEY
AIRTABLE_BASE_ID
AIRTABLE_TABLE_NAME
ANTHROPIC_API_KEY
```
