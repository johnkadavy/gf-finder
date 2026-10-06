# Landing page intro copy

_Generated intros for `/gluten-free/[...slug]` pages. Code: `lib/landing-copy.ts`, `scripts/generate-landing-copy.ts`, `app/gluten-free/[...slug]/LandingIntro.tsx`. Table: `public.landing_copy`._

## Shape (reference: The Infatuation's neighborhood intros)
One paragraph, **90–120 words** (50–80 on small pages):
1. Two or three sentences of the place's general, well-known character, wry and observational. On category pages, about that kind of food/place there.
2. A short turn to what the list is for (places worth your time that also take gluten-free seriously).
3. **Two linked spots** as where to start, one detail each: "where the whole kitchen is gluten-free" if `dedicated_gf_kitchen = "yes"`, otherwise one GF specialty or the cuisine.
4. One sentence linking two or three related guides / nearby neighborhoods.

No counts or statistics, no generic advice (shared kitchens, "tell your server"), no "if you eat gluten-free", never "celiacs", no AI tells (dashes, stock phrases). Full brief: `VOICE_GUIDE` + `buildPrompt` in `lib/landing-copy.ts`, with a fictional "Harbor Hill" example so it never goes stale.

## Data (plain columns only, no dossier reads)
- **Spots:** the page's restaurants with score ≥ 85 and Google ≥ 4.4, best score first, up to 3 offered (2 used). Fields: name, slug, cuisine, `dedicated_gf_kitchen`, up to two `gf_food_categories`.
- **Links:** search-intent guides only (pizza, brunch/breakfast, bars, cafés, bakeries, fine dining, in that priority), nearby neighborhoods (from average restaurant coordinates), city-wide guides on category pages.
- **Pages that get copy:** neighborhoods + search-intent guides. Pasta, desserts, fryer and "Dedicated GF" pages keep their template.

## Cost profile
- **Supabase:** one keyset-paginated scan of plain columns per run; pages, spots and links are computed in memory. The site's token resolution uses a cached (1h) plain-column index and the restaurants each page already loads (restaurant links only resolve to restaurants that page lists).
- **Claude:** one call per page. The fixed instructions + example (~1.3k tokens) are prompt-cached, so each page mostly pays for its ~200-token fact sheet and ~150-token output. The script prints token totals and an estimated cost at the end of every run.

## Checks (never block; `checkCopy`)
- **safety:** safety promises; kitchen claims about restaurants that aren't `dedicated_gf_kitchen = "yes"`
- **accuracy:** restaurants that aren't the page's spots; numbers
- **links:** tokens not offered for the page, malformed brackets (invalid links render as plain text)
- **format:** word count, markdown (stripped at render)
- **style:** dashes, stock AI phrases, redundant GF framing, generic advice, laundry lists

## Running it
```bash
npx tsx scripts/generate-landing-copy.ts                          # dry run: 5 sample pages, writes nothing
npx tsx scripts/generate-landing-copy.ts --page new-york/west-village
npx tsx scripts/generate-landing-copy.ts --write                  # every page without copy yet
npx tsx scripts/generate-landing-copy.ts --write --force          # regenerate everything (except locked)
npx tsx scripts/landing-copy-report.ts                            # re-check saved copy (no Claude calls)
```
Fix a page by re-running it (`--page <path> --write`) or editing it in Supabase and setting `status = 'locked'`. No automatic refresh; re-run when data has changed meaningfully.
