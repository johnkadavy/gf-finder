# CleanPlate Data Pipeline Tasks — Place Type & GF Food Categories

**Instructions for Claude Code:** Work through these tasks in order. Each task should be a separate piece of work. Do not modify any UI components until the underlying data is solid. Refer to CLAUDE.md for project rules — especially: do not modify the GF scoring logic, and do not change Supabase schema without describing the change first and waiting for confirmation.

---

## Phase 1: Disable Unfinished UI Filters

### Task P1: Remove or disable GF food filter chips from the homepage
**What:** The homepage currently has filter chips for "GF Pizza", "GF Pasta", "GF Bakery" (and similar) that were added during UX work. These filters do not have reliable backing data yet.
**Action:** Hide or remove these specific food-category chips from the homepage. Keep any chips that ARE backed by real data (e.g., "GF Fryer", "GF Menu Labels", "Dedicated GF" — confirm which ones have real data before removing).
**Do not** remove the chip component or styling — we will re-enable these once the data pipeline is updated.
**Add a code comment** where the chips were: `// TODO: Re-enable GF food category chips once pipeline Tasks P5-P7 are complete`

---

## Phase 2: Place Type

### Task P2: Add place_type column to the restaurants table
**What:** Add a new column `place_type` to the restaurants table in Supabase.
**Column spec:**
- Name: `place_type`
- Type: text (or text array if a restaurant can have multiple types)
- Nullable: yes (for now)
- Allowed values to start: `restaurant`, `cafe`, `bar`, `bakery`, `fast_casual`, `fine_dining`, `food_truck`, `deli`
**Describe the migration to me before running it.** Do not run any ALTER TABLE without confirmation.

### Task P3: Backfill place_type from existing Google Places data
**What:** Check if we already have Google Places `types` data stored anywhere (raw API responses, a JSON column, a separate table). If so, write a script to map Google Places types to our `place_type` values and backfill the column.
**Mapping logic:**
- Google `restaurant` → `restaurant`
- Google `cafe` → `cafe`
- Google `bar` → `bar`
- Google `bakery` → `bakery`
- Google `meal_delivery`, `meal_takeaway` with no dine-in → `fast_casual`
- If no type data exists locally, we may need to re-fetch from Google Places API. **Stop and ask before making any API calls** — we need to consider rate limits and cost.
**Output:** Log how many restaurants were updated and how many still have null place_type.

### Task P4: Update the ingestion pipeline to capture place_type going forward
**What:** Wherever new restaurants are ingested from Google Places API, extract the `types` field and map it to our `place_type` column using the same mapping from Task P3.
**Do not change** any other part of the ingestion pipeline. This should be a small, isolated addition.

---

## Phase 3: GF Food Categories

### Task P5: Design the GF food categories data model
**What:** We need to tag restaurants with specific GF food categories they offer. Propose a data model for this. Two options to evaluate:
- **Option A:** A `gf_food_categories` text array column on the restaurants table (simpler, good enough if categories are few and stable)
- **Option B:** A separate `restaurant_gf_foods` junction table (more flexible, better if we expect many categories)
**Categories to support initially:** `gf_pizza`, `gf_pasta`, `gf_bread_bakery`, `gf_beer_drinks`, `gf_fried_items`, `gf_desserts`
**Describe both options with pros/cons and recommend one.** Do not create anything until I confirm.

### Task P6: Update the AI enrichment prompt to extract GF food categories
**What:** Find the prompt(s) used in the AI enrichment step of the pipeline (where we analyze reviews, menus, and other data to generate restaurant signals). Add extraction of GF food categories to this prompt.
**The prompt should ask:** "Based on the available information, which of the following specific gluten-free items does this restaurant offer? Only include categories with clear evidence: GF pizza, GF pasta, GF bread/bakery items, GF beer or drinks, GF fried items (with dedicated fryer), GF desserts."
**Output format:** The AI response should return a structured list of confirmed categories.
**Show me the updated prompt before running it** on any restaurants. We need to review the output quality.

### Task P7: Backfill GF food categories for existing restaurants
**What:** Re-run the updated AI enrichment (from Task P6) on existing restaurants to populate the new GF food categories.
**Important considerations:**
- This will consume API tokens. **Before running**, estimate the cost (number of restaurants × approximate tokens per call × price per token) and tell me.
- Run a test batch of 20 restaurants first. Show me the results so we can check accuracy before running the full backfill.
- Process in batches with rate limiting to avoid API throttling.
- Log results: how many restaurants got tagged with each category, how many got zero categories.

### Task P8: Update the ingestion pipeline to capture GF food categories for new restaurants
**What:** For any new restaurants added to the database going forward, the AI enrichment step should also extract GF food categories (using the prompt from Task P6) and store them.
**This should be part of the existing enrichment flow** — not a separate step.

---

## Phase 4: Re-enable UI Filters

### Task P9: Re-enable GF food category chips with real data
**What:** Bring back the homepage filter chips that were disabled in Task P1, now backed by real data from the pipeline.
**Only show chips for categories that have meaningful coverage** — if fewer than 10 restaurants are tagged with `gf_beer_drinks`, don't show that chip yet.
**Each chip filters the restaurant cards** using the actual `gf_food_categories` data.

### Task P10: Add place_type as a filter on rankings and homepage
**What:** Add place type as a filter option on both the rankings page and the homepage.
**On rankings:** Add it as a dropdown or filter group alongside the existing Cuisine and Experience filters.
**On homepage:** Add a row of place-type chips (Restaurant, Cafe, Bar, Bakery, Fast Casual) — can be above or below the GF food category chips.
**Tapping a place type chip** should filter the displayed restaurants to that type only.

---

## Execution Notes

- **Phases 1-2** can likely be done in 1-2 days. Place type is well-structured data from an existing source.
- **Phase 3** is the heavier lift. Budget 3-5 days depending on how many restaurants need re-enrichment and how the prompt performs.
- **Phase 4** is quick UI work once the data exists.
- After all phases are complete, do a data quality spot check: pick 10 random restaurants and manually verify that their place_type and gf_food_categories are accurate.
