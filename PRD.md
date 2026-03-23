
## 1. 🎯 Objective

Build a **single-page web app** that allows users to quickly evaluate the gluten-free experience of any restaurant via a **search → score → decision flow**.

---

## 2. 👤 Target Users

### Primary

* Individuals with gluten-related dietary needs:

  * Celiac
  * Gluten-sensitive

### Secondary

* People searching on behalf of others:

  * Partners, friends, parents

### Key insight

> The product is not just for “GF people”—it’s for **anyone making a dining decision that includes a GF constraint**

---

## 3. 🧠 Core Job-To-Be-Done

> “Help me quickly determine whether a restaurant is a good gluten-free option so I can confidently decide where to eat.”

---

## 4. ⚠️ Problems with Existing Solutions

* **Fragmented information** (Google/Yelp)
* **Unstructured + conflicting reviews** (FMGF)
* **Low coverage + outdated data**
* **High effort workflows** (calling restaurants)

---

## 5. 💡 Core Product Concept

A **decision engine**, not a directory.

### Two use cases:

1. **Evaluate a known restaurant (MVP focus)**
2. (Later) Discover restaurants

---

## 6. 🖥️ Core Experience (MVP)

### Landing View

* Headline:

  > “Gluten-free search that actually works”
* Subtext (optional): clarity + trust positioning
* **Search bar (primary action)**

---

### Search Behavior

* Input: **restaurant name only**
* Autocomplete suggestions (recommended)
* Real-time or near-real-time results

---

### Result View (Same Page)

## 🎯 Hero Element: GF Score Meter

* Animated gauge (speed-test style)
* Score: **0–100**
* Color gradient: red → yellow → green

### Label Mapping:

* **80–100 → Strong**
* **50–79 → Mixed**
* **0–49 → Poor**

---

## 📊 Supporting Signals (Below Meter)

### 1. 🚨 Safety Signal (highest priority)

* Example:

  > 🔴 “2 reports of people getting sick in the last 6 months”

---

### 2. 🧾 Review Summary

* Example:

  > “Most recent reviews are positive, but some mixed experiences reported”

---

### 3. 🍽️ GF Availability

* Tiered summary:

  * Few / Ample / Many options

* Detail layer:

  * GF apps / entrees / desserts
  * GF substitutes available (bread, pasta, etc.)

---

### 4. 🧑‍🍳 Operational Confidence

* Staff knowledge (High / Medium / Low / Unknown)
* Cross-contamination risk (implicit or explicit)

---

## ⚠️ Uncertainty Handling (Key Differentiator)

When data is weak:

* Show:

  > “Limited data available”
  > “No recent reviews found”

* CTA:
  **“Request deeper analysis”**

Future:

* Trigger manual + AI research
* Follow up with user

---

## 7. 🧠 Scoring System (v1)

### Definition:

> Score represents **quality of gluten-free experience**

---

### Inputs & Weights

| Category   | Weight |
| ---------- | ------ |
| Reviews    | 50%    |
| Menu       | 30%    |
| Operations | 20%    |

---

### Review Model

#### Recency weighting:

* 0–6 months → 100%
* 6–12 months → 50%
* 12+ months → 10%

#### Key factors:

* Positive sentiment
* Negative sentiment
* “Got sick” reports (heavy penalty)

---

### Sick Report Handling

* Each recent report:
  → **Significant negative impact on score**

* Also always surfaced in UI

---

### Menu Model

* GF labeling clarity
* Number of options:

  * Few / Ample / Many
* GF substitutes available
* Allergy prompts

---

### Operations Model

* Staff knowledge
* Cross-contamination likelihood
* Dedicated equipment (if known)

---

## 8. 🧱 MVP Scope

### Must Have

* Search bar (restaurant name)
* Result page with:

  * Score meter
  * Label (Strong / Mixed / Poor)
  * 3–5 supporting signals
* Basic scoring logic
* Basic data ingestion (reviews + menu where possible)

---

### Nice to Have (but not required)

* Autocomplete
* Expandable detail view
* Source linking

---

### Out of Scope (for now)

* Discovery browsing
* Maps
* User accounts
* User reviews
* Restaurant dashboards

---

## 9. 🧭 Product Strategy Insight (Important)

### Initial wedge:

> **Ease > Trust**

You win by:

* Being faster
* Being cleaner
* Being more structured

Trust builds later via:

* Better data
* First-party reviews
* Transparency

---

## 10. 🔮 Future Opportunities (Already Implied)

* Personalization (celiac vs sensitive)
* Restaurant-side data input
* Manual verification layer
* Alerts / saved restaurants
* Coverage expansion beyond FMGF

---

# 🔧 What I Recommend You Do Next (very tactical)

You’re at a critical point—don’t overthink.

### Step 1 (today)

Implement this UI structure:

* Search → result page
* Hardcode 3–5 example restaurants with mock scores + signals

👉 Goal: **see the product**

---

### Step 2

Define your **data schema** (I can help next):

* restaurant
* reviews
* signals
* score

---

### Step 3

Hook up **one real data source**

* Even if messy
* Even if partial

---

If you want next, I’ll:
👉 Turn this into a **Supabase schema + scoring function**
👉 Or help you implement the **score meter UI in your app**

You’ve moved from idea → real product definition. This is the hard part.
