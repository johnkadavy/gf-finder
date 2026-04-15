# CleanPlate Mobile UX Improvement Tasks

**Instructions for Claude Code:** Work through these tasks one at a time, in order. After each task, describe what you changed and which files were modified. Do not move to the next task until the current one is confirmed working. Preserve all existing functionality — do not break anything that currently works.

**General rules:**
- Mobile-first: all changes should look great on a 375px-wide screen first, then scale up to desktop.
- Do not change the data model, API endpoints, or backend logic unless a task specifically says to.
- Keep the existing brand (logo, color scheme, fonts) unless a task says otherwise.
- Test each change at mobile (375px), tablet (768px), and desktop (1280px) widths.

---

## Phase 1: Homepage — Show Value Immediately

### Task 1: Add "Top Rated in NYC" cards below the search bar
**What:** Below the existing search bar on the homepage (/), add a section titled "Top Rated in NYC" that displays 6 restaurant cards in a 2-column grid on mobile (3-column on desktop).
**Each card shows:** Restaurant name, neighborhood, cuisine type, and GF score badge.
**Tapping a card** navigates to that restaurant's detail page.
**Data:** Pull from the top-rated restaurants already in the database. Hardcode to NYC for now.
**Do not** change the search bar or any existing header/footer functionality.

### Task 2: Add quick-filter chips on the homepage
**What:** Between the search bar and the "Top Rated" cards, add a horizontal scrollable row of filter chips: "Dedicated GF", "GF Fryer", "GF Pizza", "GF Pasta", "GF Bakery".
**Tapping a chip** should filter the Top Rated cards below to only show restaurants matching that attribute. If no data attribute exists for these yet, use cuisine type or existing signal data as a proxy.
**Mobile behavior:** Chips should scroll horizontally with no wrapping. Active chip gets a filled/highlighted style.

### Task 3: Add social proof or tagline beneath the hero
**What:** Below the main heading and above the search bar, add a single line of social proof. For now, use the text: "6,300+ restaurants rated across NYC and SF" (pull the actual count from your database if possible).
**Style:** Muted text, smaller than the heading. Should feel like a subtitle, not a separate section.

---

## Phase 2: Restaurant Detail Page — Better Mobile Hierarchy

### Task 4: Redesign the restaurant detail page header for mobile
**What:** The top of the restaurant detail page should show, in this order and visible without scrolling on a standard mobile screen:
1. Back arrow (already exists)
2. Restaurant name (large)
3. GF Score badge — make this visually prominent (large circle or pill with color coding: green for 80+, yellow for 50-79, red for below 50)
4. Neighborhood + cuisine type (one line, muted text)
5. One-line summary (the existing overview text, truncated to 2 lines with "read more" expand)

**Move below the fold:** The full signal breakdown, reviews section, and info/links section should all be below this header area.

### Task 5: Make the signal breakdown scannable
**What:** Redesign the signal breakdown section (GF Labeling, GF Options, Cross-Contamination, Staff Knowledge, GF Sentiment, Illness Reports) as a compact grid instead of a vertical list.
**Layout:** 2-column grid on mobile, 3-column on desktop. Each signal is a small card with an icon or colored indicator, the signal name, and the value.
**Color coding:** Green for positive values (Clearly labeled, Low contamination, High knowledge), yellow for mixed, red for concerning values.
**Keep the same data** — this is a visual redesign only.

### Task 6: Add a sticky "Quick Info" bar on the restaurant detail page
**What:** When the user scrolls past the header on a restaurant detail page, show a sticky bar at the top of the screen with: restaurant name (truncated), GF score badge, and a "Directions" button that opens Google Maps.
**Mobile only:** Hide on desktop or adapt to a less intrusive style.

---

## Phase 3: Rankings Page — Mobile-Friendly Browsing

### Task 7: Replace pagination with infinite scroll or "Load More"
**What:** Remove the page-number pagination at the bottom of the rankings page. Replace with a "Load More" button that appends the next 25 results to the existing list.
**Show a count** at the top: "Showing X of Y restaurants".
**Preserve** all existing filter functionality (city, GF Fryer, GF Menu Labels, Cuisine, Experience).

### Task 8: Improve the filter UX on mobile rankings
**What:** The current filter dropdowns may be hard to use on mobile. Redesign as:
- Top-level filters (City, Cuisine) as tappable pills that open a bottom sheet or modal with options.
- Boolean filters (GF Fryer, GF Menu Labels) stay as toggle chips at the top.
- Add a "Clear all filters" option when any filter is active.
**The filter state should persist in the URL** so users can share filtered views.

### Task 9: Compact the ranking cards for mobile
**What:** Each restaurant in the rankings list currently shows: rank number, name, location, description, links, and score. On mobile, compact this:
- Rank + Name + Score on one line
- Neighborhood + Cuisine on a second line
- Description truncated to 1 line with expand option
- Remove the Website/Google Maps links from the card (those live on the detail page)
**Tapping the card** should navigate to the restaurant detail page.

---

## Phase 4: Navigation & Global Improvements

### Task 10: Optimize the mobile navigation
**What:** The current nav (Search, Rankings, Map, About) is a horizontal bar. On mobile, this should:
- Collapse to a bottom tab bar (Search, Rankings, Map icons with labels) — this is the standard mobile pattern for apps with 3-4 main sections.
- Move "About" out of the main nav and into a settings/info menu or footer.
- The active tab should be visually highlighted.

### Task 11: Add a "Near Me" location prompt
**What:** When a user first visits on mobile, show a subtle banner or prompt: "Allow location to find GF restaurants near you." If they allow, default the city filter to their location and sort results by proximity.
**If declined,** default to NYC and don't ask again for that session.
**This affects:** Homepage top-rated cards, rankings default sort, and map center.

### Task 12: Improve page load performance
**What:** Audit the current pages for:
- Images loading without lazy loading — add lazy loading
- Large JavaScript bundles — check if anything can be code-split
- Fonts loading and causing layout shift — add font-display: swap
- Any API calls that block rendering — move to async/skeleton loading states
**Use Lighthouse on mobile** to measure before and after. Target a performance score of 80+.

---

## How to Use This File with Claude Code

**Starting a task:**
> "Read UX_TASKS.md. I want to work on Task 1. First, look at the relevant files and describe the current structure before making any changes."

**After Claude Code describes the structure:**
> "Looks good. Go ahead and implement Task 1."

**If something doesn't look right:**
> "Revert the last change. Instead, try [specific alternative approach]."

**When a task is done:**
> "Task 1 is complete. Mark it as done in UX_TASKS.md. Let's move to Task 2."
