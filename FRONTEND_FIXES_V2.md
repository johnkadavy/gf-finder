# CleanPlate Frontend Fixes v2 — Based on Visual Review

**Instructions for Claude Code:** Work through in order. These are based on actual mobile screenshots, so do not second-guess whether the issue exists — it does.

---

## Task F1: Fix text contrast across the app
**Priority: CRITICAL**
**Problem:** Secondary text throughout the app is too low contrast against the dark background. Hard to read outdoors on mobile.
**Affected elements (check all pages):**
- Neighborhood/location text on ranking cards (e.g., "CHELSEA / NEW YORK")
- "TOP RATED IN NEW YORK" section label on homepage
- "SHOWING 25 OF 3496 RESTAURANTS" count text on rankings
- Filter chip label text (e.g., "DEDICATED GF", "GF FRYER", "BAR", "CAFÉ")
- Description text on ranking cards and homepage cards
- "MORE" link text on ranking cards
- Any other muted/grey text elements
**Action:** Increase the brightness of all secondary/muted text to meet WCAG AA contrast (minimum 4.5:1 against the dark background). The background appears to be ~#1a1a1a or similar. Secondary text should be at minimum #B0B0B0, ideally #C0C0C0 or brighter. Do NOT change the orange accent color, green signal colors, or white heading text — those are fine.

## Task F2: Remove dead space between search bar and "Top Rated" section on homepage
**Priority: HIGH**
**Problem:** There is a large empty gap between the search bar / city filter and the "TOP RATED IN NEW YORK" section. On mobile this wastes precious screen space — users should see the filter chips and first restaurant cards without excessive scrolling.
**Action:** Reduce the vertical spacing/padding between the search area and the "Top Rated" section. The filter chips and at least the top of the first restaurant card should be visible on the initial screen (below the search bar) without scrolling on a standard mobile screen (iPhone 14/15 size, ~844px viewport height).

## Task F3: Make GF score more prominent on homepage cards
**Priority: HIGH**
**Problem:** The "100 GF SCORE" pill on homepage restaurant cards is small, outlined, and doesn't draw the eye. The GF score is the primary value proposition — it should be the most visible element on each card.
**Action:** Redesign the score display on homepage cards. Options (pick the one most consistent with the existing design):
- Use the same green circle treatment from the restaurant detail page, but smaller (40-48px)
- Use a filled pill with green background and white/dark text instead of an outline
- Move the score to the top-right corner of the card with a larger, bolder treatment
The score should be the first thing that catches the user's eye when scanning the card grid.

## Task F4: Add active state to filter chips
**Priority: HIGH**
**Problem:** Filter chips on the homepage all look the same whether active or inactive. No visual feedback when tapped.
**Action:**
- When a chip is selected/active, change its appearance: filled background (use the orange accent color or a muted version of it), white text, and slightly bolder weight.
- When inactive, keep the current outlined style.
- If multiple chips can be active, each active chip should show the filled state.
- Apply this to both the GF food category chips AND the place type chips.
- Also consider adding a small "×" to active chips so users know they can deselect.

## Task F5: Visually separate the two chip rows on the homepage
**Priority: MEDIUM**
**Problem:** The GF food category chips (Dedicated GF, GF Fryer, GF Pizza) and place type chips (Bar, Café, Bakery, Fast Casual) are stacked but look like one undifferentiated group. Users may not realize they're different filter categories.
**Action:**
- Add a subtle label above each row: "GF Features" for the first row, "Place Type" for the second row.
- Labels should be small, muted text (but still legible — see Task F1 contrast requirements).
- Alternatively, add a small visual divider or extra spacing between the two rows.

## Task F6: Compact the restaurant detail page header
**Priority: MEDIUM**
**Problem:** The header section (name, score circle, "Excellent" badge, location, description, "Saved" button) fills nearly the entire first screen on mobile. Users have to scroll to see the signal breakdown, which is the most actionable information.
**Action:**
- Reduce the score circle size (from what appears to be ~120px to ~80px) or place it inline to the right of the restaurant name.
- Remove the separate "EXCELLENT" badge — the score circle + number already communicates this. If you want to keep the label, put it inside or directly below the circle as smaller text.
- Tighten vertical spacing between elements.
- Goal: the signal breakdown grid should be at least partially visible on the initial screen without scrolling.

## Task F7: Add GF food category filters to the rankings page
**Priority: HIGH**
**Problem:** Rankings page has "LABELS" and "RESTAURANT" filters but no way to filter by GF food categories (pizza, pasta, bakery, etc.) even though the data now exists.
**Action:**
- Add GF food category filter chips to the rankings page, in the same horizontal scrollable row as the existing filter chips.
- Use the same chip style as the existing "LABELS" chip.
- Only show categories that have 10+ restaurants in the current city filter.
- Chips: "GF Pizza", "GF Pasta", "GF Bakery", "GF Beer", "GF Fried Items", "GF Desserts", "GF Sandwiches", "GF Breakfast" — only those with sufficient data.
- Active chip state should match whatever you implement in Task F4.
- Filter state should persist in URL params.

## Task F8: Add filters to the map view
**Priority: MEDIUM**
**Problem:** The map has no filtering capability.
**Action:**
- Add a collapsible filter bar at the top of the map page with: city selector, GF food categories, place type, and GF Fryer / Labels toggles.
- On mobile, keep filters collapsed by default with a "Filters" button that expands them. Don't cover the map.
- When filters change, update the visible map markers accordingly.
- Respect the existing login gate — filters only work for logged-in users.
