# CleanPlate — Restaurant Page Design Brief

_Last updated: 2026-09-17 · North-star reference for restaurant-page design (desktop + mobile). Every design decision references this._

## Purpose
Help a gluten-free diner decide, fast and with confidence, whether to eat at this restaurant.

## Primary user & the job-to-be-done
A GF/celiac diner evaluating one specific restaurant. The page exists to answer two questions:

1. **Is it safe?** — from social proof / reviews, menu labeling, and any restaurant-provided statements.
2. **Are there good options?** — more and better GF options mean a better experience.

Every element earns its place by helping answer one of these. If it doesn't, it comes off.

## Information hierarchy
1. **Primary — the answer:** score + one-line summary. Dominates; legible in ~2 seconds.
2. **Secondary — the evidence, in priority order:**
   - Menu / GF options
   - Illness reports (honest risk signal — kept visible, not alarmist)
   - Highlights (below)

**Highlights** — specific, meaningful GF affordances, shown **only when present** (dedicated GF fryer, GF table bread, GF menu labeling, standout GF dishes). Fully conditional: omit entirely when absent — never an "N/A" state.

## Declutter
Remove generic attribute tiles from display — **staff knowledge** and **cross-contamination**. These **remain inputs to the score** (scoring logic unchanged); we cut the low-signal display, not the signal. Their useful, concrete form lives in Highlights (a dedicated fryer says more than "cross-contamination: medium").

## Feeling — helpful, bespoke, accurate
- **Helpful** — the safe/not-safe read is never work to find; lowers anxiety, points to action.
- **Bespoke** — each page reads as written for THIS restaurant; an editorial guide entry, not a templated directory row.
- **Accurate** — precise, sourced, provenance and confidence visible; nothing overclaims. Trust is the product.

## Secondary user (constraint, not a goal)
Restaurant owners (claim flow): findable, but never competing with the diner's safety read. Claim sits below the core assessment, never inside it.

## Constraints
- Design language: dark OKLCH surfaces, IBM Plex Mono / Sans + Bebas Neue, coral #FF7444, hard corners, editorial restraint (see `DESIGN_SYSTEM.md`).
- Desktop and mobile are both first-class — designed responsively, not adapted after.

## Success measure
Primary: a lightweight "Was this helpful?" (up / down) on the page — target **>= 80% helpful**. Secondary proxies: fast time-to-decision; action rate (directions / reserve / order) as evidence of a confident yes.

## Non-goals
Feeling like a directory / aggregator; burying the answer under detail; adding anything that doesn't serve the two questions; letting owner / monetization surfaces intrude on the diner's read.
