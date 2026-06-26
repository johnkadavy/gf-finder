Draft the next CleanPlate NYC digest email and stage it in Airtable as a Draft for review.

## Credentials

Read these from `.env.local` in the project root:
- `AIRTABLE_API_KEY`
- `AIRTABLE_BASE_ID`
- `AIRTABLE_TABLE_NAME` — the restaurants table name
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

---

## Step 1 — Check recent digests

Query the "Email Digests" Airtable table for the last 3 records with Status = "Sent", sorted by "Sent At" descending. Note their Topic Type and Display label so you can avoid repeating them.

```
GET https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Email%20Digests
  ?filterByFormula={Status}='Sent'
  &sort[0][field]=Sent At
  &sort[0][direction]=desc
  &maxRecords=3
  &fields[]=Topic Type
  &fields[]=Display label
  &fields[]=Sent At
Authorization: Bearer {AIRTABLE_API_KEY}
```

---

## Step 2 — Choose a topic

Pick a topic from the pool below that:
- Has not appeared in the last 3 sent digests
- Varies in type from the most recent digest (avoid two neighborhoods in a row when possible)
- Has strong content in the DB — prefer topics with more qualifying restaurants

### Neighborhood Spotlights
| Display label | Supabase filter |
|---|---|
| Neighborhood Spotlight: Upper East Side | `neighborhood=eq.Upper East Side` |
| Neighborhood Spotlight: West Village | `neighborhood=eq.West Village` |
| Neighborhood Spotlight: Williamsburg | `neighborhood=eq.Williamsburg` |
| Neighborhood Spotlight: Upper West Side | `neighborhood=eq.Upper West Side` |
| Neighborhood Spotlight: East Village | `neighborhood=eq.East Village` |
| Neighborhood Spotlight: Hell's Kitchen | `neighborhood=eq.Hell%27s Kitchen` |
| Neighborhood Spotlight: Chelsea | `neighborhood=eq.Chelsea` |
| Neighborhood Spotlight: Park Slope | `neighborhood=eq.Park Slope` |
| Neighborhood Spotlight: SoHo | `neighborhood=eq.SoHo` |
| Neighborhood Spotlight: Astoria | `neighborhood=eq.Astoria` |

### Cuisine
| Display label | Supabase filter |
|---|---|
| NYC's Best GF Italian | `cuisine=ilike.*Italian*` |
| NYC's Best GF Thai | `cuisine=ilike.*Thai*` |
| NYC's Best GF Mexican | `cuisine=ilike.*Mexican*` |
| NYC's Best GF Japanese | `cuisine=ilike.*Japanese*` |
| NYC's Best GF Mediterranean | `cuisine=ilike.*Mediterranean*` |
| NYC's Best GF Chinese | `cuisine=ilike.*Chinese*` |
| NYC's Best GF Indian | `cuisine=ilike.*Indian*` |
| NYC's Best GF Korean | `cuisine=ilike.*Korean*` |
| NYC's Best GF French | `cuisine=ilike.*French*` |
| NYC's Best GF American | `cuisine=ilike.*American*` |

### Place Type
| Display label | Supabase filter |
|---|---|
| NYC's Best GF Bakeries | `place_type=cs.%5B%22bakery%22%5D` |
| NYC's Best GF Cafés | `place_type=cs.%5B%22cafe%22%5D` |

---

## Step 3 — Query Supabase for top restaurants

Fetch up to 15 restaurants matching the topic. Note the total returned — this is `totalCount` for the CTA.

```
GET {NEXT_PUBLIC_SUPABASE_URL}/rest/v1/restaurants
  ?city=eq.New York
  &score=gte.80
  &{TOPIC_FILTER}
  &order=score.desc
  &limit=15
  &select=id,name,neighborhood,score,slug,cuisine,place_type
apikey: {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
Authorization: Bearer {NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY}
```

Choose 3–5 restaurants to feature. Lead with the strongest picks. If there is a meaningful drop-off in quality or differentiation after 3, stop at 3. Do not pad to hit a number.

---

## Step 4 — Find Airtable record IDs

For each of the 3 chosen restaurants, look up its record ID in the Airtable restaurants table by name:

```
GET https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/{AIRTABLE_TABLE_NAME}
  ?filterByFormula={name}='RESTAURANT_NAME'
  &fields[]=name
  &maxRecords=1
Authorization: Bearer {AIRTABLE_API_KEY}
```

Collect the `id` field from each result (format: `recXXXXXXXXXXXXXX`).

---

## Step 5 — Generate rankings URL

Build the CleanPlate rankings page URL for this topic so readers can see the full list:

| Topic Type | URL pattern |
|---|---|
| neighborhood | `/rankings?neighborhood=West%20Village` |
| cuisine | `/rankings?cuisine=Thai` |
| place_type (bakery) | `/rankings?placeType=bakery` |
| place_type (cafe) | `/rankings?placeType=cafe` |

URL-encode the value. This becomes the `Rankings URL` field in Airtable and the CTA link in the email.

---

## Step 6 — Draft email content


Write two things:

**Subject line** — punchy and specific to the topic. Examples:
- "The best GF Italian in NYC right now"
- "West Village's top gluten-free spots"
- "NYC's safest GF bakeries"

**Intro copy** — 2–3 sentences. Sets up the theme editorially before the restaurant picks. Warm and knowledgeable. No filler phrases ("nestled in", "hidden gem", "a must-try"). Lead with something specific and vivid.

### CleanPlate voice
- Knowledgeable friend, not a listicle bot
- Strong opinions — if something is exceptional, say so
- Acknowledge the real anxiety of eating out with celiac, casually not clinically
- Short punchy sentences
- Never corporate, never robotic
- Never reference CleanPlate, the database, scores, or rankings in the copy — speak as someone who simply knows the city's GF scene deeply, not as a product describing its own data
- Never use em dashes (—). They read as an AI writing tell. Use a period or rewrite the sentence instead.

---

## Step 7 — Create Airtable Draft

POST a new record to the "Email Digests" table. Use the linked record IDs from Step 4 for the Restaurants field.

```
POST https://api.airtable.com/v0/{AIRTABLE_BASE_ID}/Email%20Digests
Authorization: Bearer {AIRTABLE_API_KEY}
Content-Type: application/json

{
  "fields": {
    "Topic Type": "neighborhood" | "cuisine" | "place_type",
    "Topic Target": "e.g. West Village",
    "Display label": "e.g. Neighborhood Spotlight: West Village",
    "Status": "Draft",
    "Subject Line": "...",
    "Intro Copy": "...",
    "Restaurants": ["recXXXXXXXXXXXXXX", "recYYYYYYYYYYYYYY", "recZZZZZZZZZZZZZZ"],
    "Rankings URL": "/rankings?...",
    "Total Count": 54
  }
}
```

---

## Important: avoid duplicate records

Only POST to Airtable once. Before creating the draft, check that no existing record with the same Topic Target and Status = "Draft" already exists. If one does, skip the POST and report back instead.

## Report back

Tell the user:
- Which topic was chosen and why (what was recent, what had the best content)
- The 3 restaurants selected with their scores and neighborhoods
- The drafted subject line and intro copy
- Confirmation the Airtable draft was created (include the record ID)
