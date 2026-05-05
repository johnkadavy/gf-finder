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

## Case 5 — Vibe / occasion
**Query:** "What's a good grab-and-go spot near me?"
**Tests:** Agent interprets loose intent and maps to place_type (fast_casual, deli, cafe)
**Success criteria:**
- Does not return sit-down fine dining restaurants
- Uses place_type filter (fast_casual, deli, cafe, or similar)
- Defaults to NYC (no location specified)
- Results feel appropriate for a quick, casual meal

**Ground truth query:**
```sql
SELECT name, neighborhood, score, place_type
FROM restaurants
WHERE place_type && ARRAY['fast_casual', 'cafe', 'deli']
  AND city = 'New York'
  AND score IS NOT NULL
ORDER BY score DESC
LIMIT 10;
```

**Runs:**
| Date | Result | Notes |
|------|--------|-------|
| 2026-05-05 | ✅ Pass | Asked for location + sensitivity level before searching (correct). Place type filtering correct (all results fast_casual/cafe/bakery). Scores accurate. Illness report caveat for Sushi Counter shows good judgment. Sensitivity question is a strong bonus — personalizes the score threshold. |

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
