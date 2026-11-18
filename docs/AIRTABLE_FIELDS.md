# Airtable AI agent fields

_How the enrichment fields in the main Airtable table are set up, what each one must output, and how the sync turns it into Supabase columns. Code: `lib/airtable-sync.ts` (cron + `scripts/sync-airtable.ts`), `app/api/admin/add-restaurant/route.ts` (admin add form), parsers in `lib/ai-json.ts`, `lib/place-types.ts`, `lib/gf-food-categories.ts`, `lib/reservation-link.ts`, `lib/menu-items.ts`._

The prompts themselves live in Airtable, not in the repo. This doc records the **output contract** each prompt must keep and the rules that matter. If you change a prompt's output format, update the matching parser and this doc.

## Principles (learned the hard way)

1. **Web-search agents narrate before answering.** Every model we've tried (Haiku, Sonnet, GPT-4.1) sometimes writes "Based on my search…" before the answer, whatever the prompt says. Don't fight it in the prompt; the sync handles it:
   - JSON fields → `parseAiJson()` pulls the JSON out of prose or code fences.
   - Single-value fields → the answer is the **last non-empty line** (`aiAnswerLine()` / `aiLabel()`).
   Prompts should still say "put only the answer on the final line".
2. **Never trust a value the site displays.** Every field is validated in the sync against an allowlist or a format before it's written. Anything unrecognized is dropped and logged, never stored.
3. **Absence of evidence is "unknown", never a verdict.** Schemas must offer `unknown`/`null`, or models pick a real value ("low" risk, `fryer: false`) when they found nothing. Ask for evidence (quotes, markers) where a wrong `true` is public.
4. **Give today's date** to any prompt with a time window (`DATETIME_FORMAT(TODAY(), 'YYYY-MM-DD')` formula field); models don't know it.
5. **Pass the address**, not just the city, so chains resolve to the right location.
6. **Filled-in example schemas get copied.** Use placeholders (`<integer>`, enum lists), not realistic values.

## Fields

| Airtable field | Model | Output contract | Supabase target | Validation in sync |
|---|---|---|---|---|
| JSON dossier | Sonnet | JSON object, `research_notes` first | `dossier` (JSONB) | `parseAiJson`; object required or record skipped (logged) |
| Sick reports JSON | GPT-4.1 | JSON `{sick_reports_recent, sick_reports_details[]}` | merged into `dossier.reviews` | `parseAiJson` |
| cc_risk_json | Sonnet (recommended) | JSON `{shared_equipment, staff_cc_awareness, signal, evidence}` | `dossier.operations.cc_signals` | `parseAiJson` |
| cuisine | Haiku (recommended) | one label, last line | `cuisine` | `aiLabel` (last line, ≤60 chars) |
| place_type | Haiku (recommended) | comma list or `none` | `place_type` | `parsePlaceTypes`: 12-value allowlist; `none` logged for review |
| gf_food_categories | upgraded from GPT-4.1 | comma list or `none`, last line | `gf_food_categories` | `parseGfFoodCategories`: 12-tag allowlist; `none` → `[]` |
| dedicated_gf_kitchen | Sonnet (recommended) | `Yes` / `No` / `Unverified`, last line | `dedicated_gf_kitchen` | last line, must be yes/no/unverified (DB check constraint) |
| reservation_link | GPT-4.1 | URL / `WALK_IN` / `PHONE` / `NONE`, last line | `reservation_link` + `reservation_policy` | `parseReservation`: URL validated, ordering links rejected |
| menu_items | GPT-5.4 | JSON `{menu_sections[], menu_source, confidence}`, items carry `gf_marker` | `menu_items` (JSONB) | `parseAiJson` + `enforceGfMarkers` |
| restaurant_description | not reviewed | text | `restaurant_description` | trimmed only |
| order_links | not reviewed | links | `order_links` | `parseOrderLinks` |
| display_name | not reviewed | text | `display_name` | trimmed only |

"Recommended" = the model chosen in review; confirm in Airtable if it matters.

## Field notes

### JSON dossier — the score
Feeds nearly all of `lib/score.ts`. Rules the prompt must keep:
- `research_notes` (string) **first** in the schema: an audit trail of findings + sources, written before any rating.
- Evidence rules: never estimate; missing → `"unknown"`/`null`; counts are reviews actually read (0 if none).
- `cross_contamination_risk: "low"` requires positive evidence; otherwise `"unknown"`.
- `dedicated_equipment.fryer`: `true` = confirmed dedicated, `false` = confirmed shared, `null` = unknown or no fryer. (`false` costs 5 ops points, so it must never mean "unknown".)
- `gf_labeling`: `clear | partial | none | unknown`.
- `short_summary` is public; sourcing detail belongs in `research_notes`.

### cc_risk_json — overrides the dossier's CC risk
`signal` takes priority over `dossier.operations.cross_contamination_risk` (`lib/score.ts`). Contract: `signal: high | medium | low | unknown`. **"Absence of evidence is unknown, never low"** — before this rule, 886 rows got "low" (the best score) from "no information found". The scorer treats anything but high/medium/low as no signal and falls through to the dossier, then the cuisine prior. Serving bread is not "shared equipment".

### Sick reports JSON
Each report costs ~5 overall points (−12 on reviews, cap −40). Prompt needs **today's date** for the 6-month window — without it 35% of reports were outside the window when fetched. Reports never expire in scoring; staleness is handled by re-running the field. Count only gluten reactions, `sick_reports_recent` = length of details.

### cuisine
Feeds `normalizeCuisine()` (`lib/cuisine.ts`) → filter + cuisine CC prior (Italian/French high; Steakhouse/Vegan low). Prompt offers the canonical labels incl. Steakhouse, Seafood, Barbecue, Burgers, Vegan / Vegetarian, Bar & Pub, Cafe, Bakery. Regional labels are allowed but map to "Other" unless `normalizeCuisine` knows them.

### place_type
Allowlist: `restaurant, fast_casual, food_truck, cafe, bar, bakery, pizzeria, deli, dessert_shop, juice_bar, brunch_spot, fine_dining` (`lib/place-types.ts`). Service format (restaurant / fast_casual / food_truck) is **at most one**. `none` = closed or not a food business → logged for review, not stored. `bakery`/`pizzeria`/`deli` set the high CC prior in scoring.

### gf_food_categories
12 tags, all displayed on restaurant pages (`GF_FOOD_LABELS`) and landing copy; `gf_pizza`/`gf_pasta`/`gf_breakfast`/`gf_desserts` also drive landing pages, filters and Ask — the most visible field. Main failure: tagging what a place sells (pizzeria → `gf_pizza`) without evidence. `gf_fried_items` displays as "GF Fryer" and requires a stated dedicated fryer.

### dedicated_gf_kitchen
Only `yes` does anything: the "Dedicated GF" landing category (`dedicated_gf_kitchen = 'yes'`), highlights, and landing-copy kitchen claims. Precision over recall — requires explicit first-party "100% gluten-free" language for this location; "naturally GF", "mostly GF", "everything except…" are not enough. Spot-check every new `yes` by hand.

### reservation_link
Last line is one of: a booking URL → `online`; `WALK_IN` → `walk_in`; `PHONE` → `phone`; `NONE` → both null. Column `reservation_policy` (migration `20261118120000`). Rejected as links: prose, `order.*` hosts, Toast/Sauce/ChowNow/Square ordering, `/online-ordering` paths, social/listing pages. Kept: any path containing "reserv" (Reserve with Google, `toasttab.com/<x>/reservations`). An answered-but-invalid value clears the stored link; an empty field leaves it alone. Page shows Reserve / "Call to reserve" / "Walk-in only".

### menu_items
The restaurant page lists **only `gf: true` items** as the GF menu, so `true` must be backed by `gf_marker` (exact label text: item label, GF section heading, or restaurant-wide 100% GF statement). `enforceGfMarkers()` downgrades `true` without a marker to `null` — only on marker-aware output, so old output re-synced unchanged keeps its items. Drink sections are skipped. Include every GF-marked item even on long menus.

## Operations

- **Sync:** `npx tsx scripts/sync-airtable.ts --needs-sync` drains the "Needs sync" view (same as the cron). It only updates rows that already exist in Supabase; failed writes aren't stamped and retry next run. Watch the log for `Unparseable`, `Dropped invalid`, `place_type "none"`, `no gf_marker`, `Unrecognized dedicated_gf_kitchen`.
- **The cron also syncs** — records can land in Supabase before a manual sync. Deploy parser changes before re-running a field with a new output format.
- **Rescoring:** synced rows rescore themselves. After changing `lib/score.ts`, run `backfill-scores.ts --all` (dry run) then `--all --write`, and bump `SCORING_MODEL_UPDATED_AT`.
- **Data cleanups** that bypass the sync must rescore touched rows (`rescoreRestaurants()`) when they change `dossier`, `cuisine` or `place_type`.
- **Not reviewed yet:** restaurant_description, order_links, display_name.
