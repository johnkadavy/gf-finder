# CleanPlate Agent — Eval Cases

Each case has a canonical query, the use case category, what success looks like,
and a spot-check log of runs. Ground truth is pulled from Supabase at eval time.

---

## Case 1 — Food-type + location
**Query:** "GF sandwiches in the West Village"
**Tests:** Agent filters by `gf_food_category: gf_sandwiches` AND `neighborhood: West Village`
**Success criteria:**
- Returns restaurants that have `gf_sandwiches` in `gf_food_categories`
- All results are in the West Village (or adjacent, with explanation)
- Results ordered by score (highest first)
- No restaurants returned that don't have GF sandwiches specifically

**Ground truth query:**
```sql
SELECT name, neighborhood, score, gf_food_categories
FROM restaurants
WHERE neighborhood = 'West Village'
  AND 'gf_sandwiches' = ANY(gf_food_categories)
ORDER BY score DESC;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ⚠️ Partial | Tool use correct. Beer Garage returned as false positive — `gf_sandwiches` in DB but not on actual menu. Pipeline data quality issue, not agent reasoning failure. Hudson Clearwater result unverified. |
| 2026-05-05 | ✅ Pass | After prompt update + sync. All 5 results correct, right order by score. Missed All'Antico Vinaio (score 60, tied with Merriweather) — limit=5 artifact, not a reasoning failure. |

---

## Case 2 — Safety-level filtering
**Query:** "Celiac-safe restaurants in the East Village"
**Tests:** Agent uses score threshold (85+) and/or cross_contamination_risk = low
**Success criteria:**
- Results have high GF scores (85+) or explicitly low CC risk
- Agent references specific safety signals (dedicated fryer, CC risk, staff knowledge)
- Does not return restaurants with illness reports or high CC risk
- Results are in the East Village

**Ground truth query:**
```sql
SELECT name, neighborhood, score,
       dossier->'operations'->>'cross_contamination_risk' as cc_risk
FROM restaurants
WHERE neighborhood = 'East Village'
  AND score >= 80
ORDER BY score DESC;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ✅ Pass | Count (24/307) accurate. Top 5 correct. Moko/Odo tied at 98 — order artifact only. Language well-calibrated: "100% GF menu" used for genuinely dedicated kitchens, not as a safety absolute. Disclaimer present. |

---

## Case 3 — Specific restaurant lookup
**Query:** "Is Soda Club safe for celiac?"
**Tests:** Agent uses `get_restaurant_details`, returns accurate safety signals
**Success criteria:**
- Calls `get_restaurant_details` (not `search_restaurants`)
- Reports the correct GF score from the DB
- Covers: CC risk, dedicated fryer, staff knowledge, illness reports, menu labeling
- Does not fabricate signals not present in the dossier

**Ground truth query:**
```sql
SELECT name, score,
       dossier->'operations'->>'cross_contamination_risk' as cc_risk,
       dossier->'operations'->'dedicated_equipment'->>'fryer' as dedicated_fryer,
       dossier->'operations'->>'staff_knowledge' as staff_knowledge,
       dossier->'reviews'->>'sick_reports_recent' as sick_reports
FROM restaurants
WHERE name ILIKE '%Soda Club%';
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ✅ Pass | Score (97), signals, and caveats all accurate. Good calibration — flagged medium CC risk and no dedicated fryer despite high score. Language issue: "in our database" sounds unnatural. Fixed via system prompt rule 11. |

---

## Case 4 — Cuisine + location
**Query:** "Find me good Italian in the West Village"
**Tests:** Agent filters by cuisine AND neighborhood, returns genuinely Italian restaurants
**Success criteria:**
- Results are Italian cuisine (not just any GF restaurant in the area)
- Results are in the West Village
- Results have solid GF scores (not just any Italian place)
- Agent doesn't conflate "Italian" with pizza-only

**Ground truth query:**
```sql
SELECT name, neighborhood, cuisine, score
FROM restaurants
WHERE neighborhood = 'West Village'
  AND cuisine ILIKE '%italian%'
  AND score IS NOT NULL
ORDER BY score DESC;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ✅ Pass | Top 5 correct and in order (100, 99, 95, 93, 91) out of 73 Italian restaurants in the neighborhood. Good calibration — flagged CC risk and shared fryer caveats for lower-scoring options without being alarmist. |

---

## Case 5 — Vibe / occasion, neighborhood-only follow-up
**Query:** "What's a good grab-and-go spot near me?" → when the agent asks for location, answer with **just a neighborhood name** (e.g. "I'm in the West Village") — no street, cross-street, or landmark. That detail matters: a street-level answer triggers a different code path (lat/lng geo search) covered separately by Case 7. Keeping this case's second turn neighborhood-only is what makes its ground truth query below valid.

**Tests:** Agent recognizes "near me" is unresolvable (no real location given, no browser geolocation available) and asks before searching, rather than silently defaulting to a city. Given a plain neighborhood name, filters by `neighborhood` (not lat/lng) and correctly maps "grab-and-go" to place_type.

**Known conflict:** the "asks before searching" criterion was originally written as intentionally stricter than the system prompt (rule 5 defaults to NYC; rule 11 discourages clarifying when a vibe/meal-type word like "grab-and-go" is present) — expected to fail. It didn't: a real run (logged under Case 7, which used this same opening query) showed the agent asking for location anyway. Worth remembering: reasoning about a system prompt is not a substitute for actually running the case — this one didn't behave the way the rules on paper predicted.

**Success criteria:**
- Asks the user for their location before searching, instead of assuming a default city
- Filters by `neighborhood` — not `lat`/`lng` — since the answer is a plain neighborhood name
- Does not return sit-down fine dining restaurants
- Uses place_type filter (fast_casual, deli, cafe, or similar)
- Results stay within the named neighborhood — no bleed into adjacent ones
- Results feel appropriate for a quick, casual meal

**Ground truth — two checks:**
1. **Process (no DB needed):** did the agent ask a clarifying question about location before calling `search_restaurants`? Did the follow-up tool call use `neighborhood`, not `lat`/`lng`?
2. **Data (fill in after the conversation, once you know what neighborhood you gave it):**
```sql
SELECT name, neighborhood, score, place_type
FROM restaurants
WHERE place_type && ARRAY['fast_casual', 'cafe', 'deli']
  AND neighborhood = '<neighborhood you answered with>'
  AND score IS NOT NULL
ORDER BY score DESC
LIMIT 10;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| — | — | Not yet run with a neighborhood-only follow-up — the only real run so far (2026-08-07) used a street-level answer ("west village, on 14th st") and is logged under Case 7 instead, since it triggered the geo path this case is explicitly scoped to exclude. |

---

## Case 6 — Location overview
**Query:** "What's the GF dining scene like in the West Village?"
**Tests:** Agent uses `get_neighborhood_overview`, synthesizes a meaningful summary
**Success criteria:**
- Calls `get_neighborhood_overview` (not just `search_restaurants`)
- Includes total restaurant count and average score for the neighborhood
- Highlights standout restaurants (top-rated)
- Gives a genuine sense of the neighborhood's GF friendliness
- Does not just list restaurants without synthesis

**Ground truth query:**
```sql
SELECT
  COUNT(*) as total,
  ROUND(AVG(score)) as avg_score,
  MIN(score) as min_score,
  MAX(score) as max_score
FROM restaurants
WHERE neighborhood = 'West Village'
  AND score IS NOT NULL;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ✅ Pass | All stats exact: 269 restaurants, avg 56, score breakdown 30/21/34/184, top 5 correct. Used get_neighborhood_overview correctly. Good framing — avg score context helps user calibrate expectations. Beer Garage at 98 is correct (dossier score is legitimate, gf_sandwiches false positive was a separate data issue). |

---

## Case 7 — Vibe / occasion, street-level follow-up (geo search)
**Query:** "What's a good grab-and-go spot near me?" → when the agent asks for location, answer with a **street-level or intersection detail** (e.g. "I'm in the West Village, on 14th St") — not a plain neighborhood name. This is the split-off sibling of Case 5: same opening query, but a location answer specific enough to trigger geo search (`lat`/`lng`/`radius_miles`) instead of a `neighborhood` filter. The two paths need different ground truth, which is why this is a separate case rather than a second acceptable outcome of Case 5.

**Tests:** Agent (1) asks for location before searching, same as Case 5; (2) resolves a street-level description to roughly correct coordinates; (3) searches by geographic radius rather than administrative neighborhood boundary, so results may legitimately span multiple neighborhoods near the given point.

**Success criteria:**
- Asks the user for their location before searching
- Tool call uses `lat`/`lng`/`radius_miles` — not a plain `neighborhood` string
- Resolved coordinates are plausible for the stated location (sanity-check against a map, not exact-match — there's no single "correct" lat/lng for an area description)
- Does not return sit-down fine dining restaurants
- Results crossing into an adjacent neighborhood are fine/expected if genuinely within the radius (not a bug, unlike Case 5)
- Final restaurants shown are consistent with the actual scores returned by the tool call(s) — not missing higher-scoring candidates without an explainable reason

**Ground truth — three checks:**
1. **Process (no DB needed):** did the agent ask for location before searching? Did it use `lat`/`lng`, not `neighborhood`?
2. **Geocoding sanity check:** do the resolved `lat`/`lng` fall within a reasonable distance of the stated location? (Rough human judgment call, not automatable without a geocoding service.)
3. **Data (fill in with the actual lat/lng/radius the agent used):**
```sql
WITH distances AS (
  SELECT name, neighborhood, score, place_type,
    (3959 * acos(
      cos(radians(<lat>)) * cos(radians(lat)) *
      cos(radians(lng) - radians(<lng>)) +
      sin(radians(<lat>)) * sin(radians(lat))
    )) AS distance_miles
  FROM restaurants
  WHERE place_type && ARRAY['fast_casual', 'cafe', 'deli']
    AND score IS NOT NULL
    AND lat IS NOT NULL AND lng IS NOT NULL
)
SELECT * FROM distances
WHERE distance_miles <= <radius_miles>
ORDER BY score DESC;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-08-07 | ⚠️ Partial | Asked for location before searching (pass). Correctly used lat/lng (40.7378, -74.0020) + radius 0.4mi for "West Village, on 14th St" — plausible coordinates. `place_type` is a single-value tool param, not an array, so the agent made two separate calls (`fast_casual`, then `cafe`) to broaden coverage — good adaptive behavior, and it's why Fellini Cucina (missing in an earlier ad hoc test) showed up this time. Combined candidate pool across both calls had 9 unique restaurants; final answer showed only 4 (Hungry Llama 92, Locanut 95, Kimbap Lab 99, Som Bo 91), dropping Washington Squares (94) and OASES (92) despite equal-or-higher scores than some shown. Re-examined against system prompt rule 6 ("Prioritize by GF score, then relevance to the request") — both drops correlate with a real relevance weakness, not an arbitrary cut: Washington Squares had null hours/is_open_now (can't confirm it's even open, undermining "right now" relevance) and is place_type-first a pizzeria; OASES had cross_contamination_risk: "unknown" (undocumented protocols) and place_type includes "bar", a weaker fit for "grab-and-go". Plausibly correct behavior under rule 6, not a bug — though this is inference from the data pattern, not the model's actual stated reasoning (not captured in the trace). Still unexplained: no rule dictates showing exactly 4 results rather than 3 or 5 — that count appears to be unconstrained by any prompt instruction. |

---

## Case 8 — Out-of-coverage location
**Query:** "What's the best GF food in Singapore?"
**Tests:** Agent recognizes Singapore has no coverage — no restaurant data exists for it, and it isn't a real product region — and deflects gracefully instead of returning nothing with no explanation or, worse, fabricating an answer. Two sub-cases with different expected mechanisms:
- **(B) Logged-out / anonymous user:** should always get a default "I only cover New York City for now" — style response.
- **(A) Logged-in user:** should only get that default response after the agent checks their `allowed_cities` — not because Singapore could ever realistically be in it, but because the *mechanism* should be "check access, then respond," not "assume NYC-only for everyone regardless of who's asking."

**Known gap — (A) is not currently buildable, (B) might already work:** `getUsageContext()` in `app/api/agent/route.ts` only fetches `agent_queries_used`, `agent_query_limit`, `is_admin` from the logged-in user's profile — it never fetches `allowed_cities`, so that data never reaches the agent at all. (A) is written against target behavior and is expected to fail today; it exists to drive a real feature build (thread `allowed_cities` into the agent's context), then get re-tested once that's in place. (B) is different — it doesn't need any new wiring, just correct model behavior given a zero-result search and general awareness this is an NYC-focused product. Outcome unknown until actually run; no system prompt rule currently guarantees it either way.

**Success criteria:**
- Does not fabricate a Singapore restaurant or claim to have data it doesn't have (ties to rule 4: "don't hallucinate")
- Response clearly communicates the coverage limitation, not just a bare "no results found"
- (A) only: process check — did the agent's behavior differ based on the user's `allowed_cities`, or did it apply the same NYC-only assumption regardless of who's asking?

**Not a criterion — informational only:** whether `search_restaurants` gets called before the agent concludes there's no coverage. Originally written as a required check, but Singapore is too unambiguous a location to test it meaningfully — skipping the tool call for something this obviously out-of-scope is efficient, correct behavior given how the product is positioned, not a gap. Worth noting per run (did it verify or reason from the name alone), but not grading against it here. The real version of that question — does the agent verify before assuming when a location is genuinely ambiguous, not obviously in or out of scope — needs a different case with an example where the answer isn't trivial (e.g. a place name that's plausible both inside and outside coverage, like a Hamptons town sharing a name with a city elsewhere). Not built yet; noted as a future case.

**Ground truth — process check, no SQL needed:**
1. For a logged-in user: is there any evidence the agent's response accounted for their specific access, or did it respond identically to how an anonymous user would?

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-08-08 | ✅ Pass (B only) | Anonymous user ("where are some good places to eat in singapore?"). No fabrication, clearly communicated the coverage limit, on-brand and helpful (redirected to celiac groups/GF apps for Singapore, looped back to NYC). Skipped `search_restaurants` entirely — reasoned directly from general knowledge that Singapore is out of scope. Not held against it: see the note above on why that's fine for an unambiguous case. (A) — logged-in, `allowed_cities`-aware behavior — still untested; expected to fail today per the known gap above. |

---

## Case 9 — Thin/zero results, broadened search
**Query:** "looking for sri lankan food in west village"
**Tests:** Agent handles a cuisine+neighborhood combination with no matches by broadening the search — dropping the neighborhood filter and retrying with just the cuisine — rather than reporting a dead end. Verified premise: zero Sri Lankan restaurants in West Village; 2 exist NYC-wide (LAK Sewana FOOD, Murray Hill, score 46; Sigiri, East Village, score 45) — both in the 40–54 "Limited/Inconsistent" band.

**Known gap — not explicitly instructed, outcome genuinely unknown:** no system prompt rule tells the agent to broaden on thin/zero results. Rule 4 only covers honesty about not finding something, not a retry-with-relaxed-filters mechanism. This is aspirational/target behavior, not guaranteed today. Worth noting: Case 7 already showed the agent independently making two `search_restaurants` calls with different parameters to widen coverage, unprompted — real precedent that this kind of autonomous multi-call behavior is at least plausible here, just not certain.

**Success criteria:**
- Recognizes zero results for Sri Lankan + West Village specifically (doesn't fabricate a match)
- Either broadens by dropping the neighborhood filter and shares what it finds, **or** asks the user whether to broaden by location or pivot cuisine before acting — both are valid; asking first is arguably the better UX since it doesn't assume what the user actually wants (wider area vs. different cuisine vs. neither)
- If it does share alternatives, results scoring low (45, 46 — Limited/Inconsistent) should be framed honestly, not oversold just because they're the only options — ties to rule 13
- Any suggested pivot cuisines should ideally be grounded in a real search, not asserted from general knowledge — noted as a soft preference, not graded. A real run scored well here without verifying ("Indian or Thai can have great GF options" was asserted, not checked), and it wasn't wrong, just not backed by a tool call. Not worth nitpicking on a low-stakes claim like cuisine variety — but the same pattern on a *safety-relevant* claim (cross-contamination risk, dedicated fryer status) would be a real problem, worth watching for specifically if it ever shows up there.

**Ground truth — two checks:**
1. **Process:** did the agent call `search_restaurants` with `cuisine: "Sri Lankan"` + `neighborhood: "West Village"` and correctly get zero results? (A second, broadened call is no longer required — see success criteria above.)
2. **Data:**
```sql
SELECT name, neighborhood, score, cuisine
FROM restaurants
WHERE city = 'New York'
  AND cuisine ILIKE '%sri lankan%'
  AND score IS NOT NULL
ORDER BY score DESC;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-08-08 | ✅ Pass | Correctly searched cuisine+neighborhood, got zero results, didn't fabricate a match. Instead of auto-broadening, asked whether to search wider Manhattan or pivot cuisine (Indian/Thai suggested) — good UX, doesn't assume what the user wants. Note, not a fail: characterized West Village as "mostly pizzerias, Italian, brunch spots" and suggested Indian/Thai as GF-friendly pivots without a second tool call to verify either claim — happened to be roughly accurate (consistent with earlier West Village traces) but was asserted, not checked. Low-stakes claim, not worth grading against; would be a real concern if the same pattern showed up on a safety-relevant claim instead. |

---

## Cross-cutting checks — formatting & voice

Unlike Cases 1–7, these aren't tied to one query — they're checkable against **any** response's `response_text` (cross-referenced with `tool_trace` where needed), and should hold regardless of what was asked. All are pure code checks — regex/string matching against columns already captured in `agent_query_logs`, no LLM judge and no new DB query required.

**Markdown links (system prompt rule 9):** every restaurant name mentioned in the response must be a markdown link using the tool result's `url` field — `[Name](url)`, not a bare name. Checkable by cross-referencing `response_text` against the restaurant names/urls present in that turn's `tool_trace` results.

**Banned phrases (voice section + rule 10):** `response_text` should never contain, case-insensitive: "great question", "certainly!", "of course!", "i'd be happy to help", "absolutely!" (filler), or "in our database" / "in our system" (breaks the "knows this personally" voice).

**Absolute safety claims (rule 13):** `response_text` should never contain "zero risk", "100% safe", "no risk", or close variants — these overclaim certainty about GF safety. This one's a correctness/safety issue, not just a style preference, since it directly contradicts what the product is supposed to communicate about risk.

**Not yet covered:** rule 14's full multi-restaurant listing template (bold link, metadata line with `·` separators, one sentence, blank line between entries) is more involved to regex-validate reliably and isn't included yet — worth adding as its own check if it turns out to drift in practice.

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| — | — | Not yet run against real responses. |
