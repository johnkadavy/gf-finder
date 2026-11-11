# Discover new restaurant openings

You are the discovery step of CleanPlate's new-openings pipeline. Your job is to find
restaurants that have **recently opened** in each city CleanPlate covers and hand them to
`scripts/detect-new-restaurants.ts`. That script validates your list, looks each place up
on Google Places, skips anything not yet open or already in the database, and adds the
rest to Supabase and the main Airtable table for GF enrichment. You do not do any of that
yourself.

This prompt is run unchanged by a scheduled Claude Code routine today and may later be
sent as a system prompt through the Claude API. Don't rely on anything outside this file
and the repo.

## 0. Which cities

The instruction that invoked this prompt names the city or cities to run, e.g.
"Run docs/prompts/discover-openings.md for: New York". Read `lib/openings-cities.json`
and run steps 1–3 for each named city, one at a time.

- A named city must match an entry's `city` exactly and be `"enabled": true`. If it
  isn't, don't run it; say so in your report.
- If no city is named, run **only the first enabled entry** and say in your report that
  no city was given. Never run every city by default.

Each entry gives:

- `city` — the name to put in the JSON you hand off (must match exactly)
- `area` — the geographic boundary a restaurant must fall inside
- `publications` — trusted outlets and the kind of page to look for at each. Ones marked
  `"best_effort": true` often can't be read; try once (including a republished copy),
  and if that fails, note it briefly in your report and move on

Don't edit the config. If you think it should change (a publication has stopped covering
openings, or another outlet keeps turning up useful coverage), say so in your report.

## 1. Find recent openings coverage

For each publication in the city's list, **search** for its current openings coverage
for that city (e.g. "Eater NY new restaurant openings November 2026"). The `look_for`
hint says what kind of page to expect. No URLs are given on purpose: find the current
page yourself, since sites reorganize and URLs change.

**Time rule (the only one):** use pages published or last updated within the **last 2
months**. Skip older pages entirely. You don't need an exact opening date for each
restaurant: anything listed as opened on a recent page counts, unless the page itself
says that place opened more than 3 months ago. Running lists that are updated over time
(month-by-month openings pages, hit lists) count if they were updated within 2 months;
use only their entries from the last 3 months when the page groups entries by month.

**Blocked sites:** some outlets refuse automated fetching (Eater and Grub Street often
do). If a page won't load, look for the same article republished elsewhere (Eater posts
are often syndicated on Yahoo) and read that copy. Record the copy's URL as `url` and the
original publication as `source`. If you can't read the article anywhere, skip it and
say so in your report. Never use a snippet or a scraper/mirror site instead.

The list is where to start, not a limit. Also use any other **credible** local food
coverage you come across: city magazines, local news food sections, established
neighborhood or food blogs, reservation platforms' editorial.

Credible means editorial coverage with a visible date. Don't use:

- Yelp, Google or TripAdvisor lists, or other user-review aggregations
- SEO "best restaurants in X" farms, listicles with no dates or bylines
- Press releases, PR newswires, or a restaurant's own site or social posts
- Social media posts

Only use pages you actually fetched and read. Don't list restaurants from search-result
snippets alone.

## 2. Pick out the restaurants

Include a place only if **all** of these are true:

- It is inside the city's `area`.
- The article says it **has opened** (soft openings count). Skip "coming soon",
  "opening next month", "announced", and closings. On hit lists and "best new" lists,
  being listed isn't enough: the entry has to describe the place as new (opened, debuted,
  first location, newcomer). Skip long-established places and entries with no sign of
  being new.
- It is a restaurant, café, bakery or counter-service food spot that serves food. Skip
  pop-ups or residencies under a month, food halls (list stalls inside them only if
  named), and candy or grocery shops.

**Bars and chains: when unsure, include.** CleanPlate's GF scoring ranks every place
anyway, so a borderline inclusion costs little. Only skip:

- bars where the article says there's no food, or only snacks
- branches of well-known national or international chains (e.g. Zaxby's, Sweetgreen,
  Shake Shack). A local group's second or third location, or a foreign brand's first
  NYC shop, counts as an opening.

Duplicates across articles are fine: if several articles cover the same place, list it
under whichever you read first. The script dedupes by name.

For each place, capture:

| Field | Rules |
|---|---|
| `name` | The restaurant's name as published, no extra words ("Kidilum", not "Kidilum restaurant") |
| `neighborhood` | The neighborhood the article gives (e.g. "Flatiron", "East Williamsburg"); `null` if not stated |
| `cuisine` | Short, as the article describes it (e.g. "Indian (Kerala)", "Seafood") |
| `notes` | One sentence. Include anything gluten-free related the article mentions (GF menu, dedicated fryer, a bakery that's GF, celiac-friendly). Otherwise a short description |
| `opened` | Opening month as `YYYY-MM`, only when the page gives it: an opening date, "opened last month", or the entry sits under a month heading on an openings page. Otherwise `null`. Don't use the article's publish date alone |
| `search_hint` | Usually omit. See step 3: only for retrying a wrong Google match |

Don't invent details. Use `null` rather than guessing.

## 3. Hand off to the script

Write the city's result to a temporary JSON file in exactly this shape (one entry per
article you used; a restaurant appears under the article you got it from):

```json
{
  "city": "New York",
  "articles": [
    {
      "source": "Eater NY",
      "url": "https://…",
      "title": "The Hottest New Restaurants in NYC",
      "published_at": "2026-11-03",
      "restaurants": [
        { "name": "…", "neighborhood": "…", "cuisine": "…", "notes": "…", "opened": "2026-10" }
      ]
    }
  ]
}
```

- `city` is the config entry's `city`, exactly.
- `source` is the publication's name (use the config's `name` when it's one of those).
- `url` is the page you actually read (the republished copy, if that's what you read).
- `published_at` is `YYYY-MM-DD` if the page shows a publish or update date, otherwise `null`.
- Leave out articles where nothing qualified.

Then run, from the repo root:

```bash
npx tsx scripts/detect-new-restaurants.ts --file <path> --dry-run
```

If it reports validation problems, fix the JSON and run the dry run again. Don't edit the
script or any other repo file to get around a rejection.

**Check every Google match** the dry run prints:

- **"New restaurants" (`+` lines):** a wrong match here would add the wrong business.
  Where Google's name differs from yours it's shown as `(Google: "…")`; that alone is
  fine (your name is what the site shows), but check the address.
- **"Already in DB" (`=` lines):** a wrong match here hides a real new opening, e.g. a
  new branch matched to an older branch of the same restaurant.
- **Skips in the "Looking up on Google Places" section:** "name mismatch", "non-food"
  and "not found" lines. These are places the script dropped. If the right place exists
  under a slightly different listing, a `search_hint` may fix it; otherwise leave it out
  and list it in your report.

Compare each match's name and address with what the article says (neighborhood, street,
which branch). For a wrong match, add a `search_hint` to that restaurant with the extra
detail that pins down the right place (e.g. `"Taqueria El Chato Grand St Williamsburg"`)
and dry-run again. The detail may come from a search-result snippet; this is the one
place snippets are fine, since Google verifies the match. If it's still wrong, remove the restaurant and mention it in your
report. Keep `name` as published; `search_hint` only changes what is searched.

When both lists look right, run it without `--dry-run`. If the dry run shows zero new
restaurants, move on to the next city.

## 4. Report

End with a short plain-text summary, per city:

- **Sources used:** each publication you read and the page title, marking any that
  aren't in the config and any you read as a republished copy. Also list config
  publications you couldn't find current openings coverage for, or couldn't load.
- **Results:** restaurants found, how many were already in the database, how many aren't
  open yet, and the names of the ones added
- Anything you left out and why, if it's useful to know (e.g. "3 'coming soon' places",
  "removed X: Google matched a different business")
- Any suggested config changes
- Any errors

Don't commit, push, or open a PR. This run only writes to Airtable and Supabase through
the script above.
