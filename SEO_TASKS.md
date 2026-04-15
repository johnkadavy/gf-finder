# CleanPlate SEO Implementation Tasks

**Instructions for Claude Code:** Work through these tasks in order. Tasks S1-S6 are fully technical — implement them directly. Tasks S7-S8 involve content templates where you'll set up the structure, but the actual written content will be provided or edited by the founder. Do not generate fake or placeholder blog content — create the page infrastructure only.

---

## Phase 1: Technical SEO Foundations

### Task S1: Add unique meta tags to all restaurant detail pages
**What:** Every restaurant detail page (/restaurant/[id]) needs a unique, optimized `<title>` and `<meta name="description">` tag.
**Title format:** `[Restaurant Name] — Gluten-Free Safety Rating | CleanPlate`
**Description format:** `[Restaurant Name] in [Neighborhood], NYC scores [Score]/100 for gluten-free safety. [Key signal summary — e.g., "Dedicated GF kitchen, clearly labeled menu, low cross-contamination risk."]. See full GF breakdown.`
**Pull all data dynamically** from the existing restaurant record — name, neighborhood, score, and top signals.
**Also add:**
- `<meta property="og:title">` and `<meta property="og:description">` (same content, for social sharing)
- `<meta property="og:type" content="website">`
- `<meta property="og:url">` with the canonical URL
**Do not** hardcode any restaurant data — this must work dynamically for all 3,500+ restaurants.

### Task S2: Add unique meta tags to the rankings page
**What:** The rankings page should have dynamic meta tags based on active filters.
**Default (no filters):** 
- Title: `Top Gluten-Free Restaurants in NYC — Ranked by Safety | CleanPlate`
- Description: `Browse 3,500+ NYC restaurants ranked by gluten-free safety. Filter by dedicated GF kitchen, GF fryer, GF pizza, neighborhood, and more.`
**With city filter:**
- Title: `Top Gluten-Free Restaurants in [City] — Ranked by Safety | CleanPlate`
**With food category filter:**
- Title: `Best [GF Pizza/GF Pasta/etc.] in [City] | CleanPlate`
**With neighborhood filter:**
- Title: `Best Gluten-Free Restaurants in [Neighborhood], [City] | CleanPlate`
**Update dynamically** as users apply filters. Use the most specific active filter for the title.

### Task S3: Add structured data (JSON-LD) to restaurant detail pages
**What:** Add Schema.org structured data to each restaurant detail page so Google can display rich results.
**Use the `Restaurant` schema type with:**
```json
{
  "@context": "https://schema.org",
  "@type": "Restaurant",
  "name": "[Restaurant Name]",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "[Address]",
    "addressLocality": "[City]",
    "addressRegion": "[State]",
    "postalCode": "[Zip]"
  },
  "telephone": "[Phone]",
  "url": "[Restaurant Website]",
  "servesCuisine": "[Cuisine Type]",
  "aggregateRating": {
    "@type": "AggregateRating",
    "ratingValue": "[GF Score]",
    "bestRating": "100",
    "worstRating": "0",
    "ratingCount": 1
  }
}
```
**Note:** Use ratingCount of 1 for now since the score is algorithmic, not from multiple user ratings. Update this when you have real user reviews. Pull all fields from the existing database. Only include fields that have data — don't include null phone numbers, etc.

### Task S4: Generate an XML sitemap
**What:** Create a dynamic XML sitemap at `/sitemap.xml` that includes:
- Homepage
- Rankings page
- Map page
- About page
- All programmatic landing pages (from Task S5)
- ALL restaurant detail pages (all 3,500+)
**Each entry should include:**
- `<loc>` — full canonical URL
- `<lastmod>` — last modified date (use the restaurant's last enrichment date if available, otherwise current date)
- `<changefreq>` — "weekly" for restaurant pages, "daily" for rankings
- `<priority>` — 1.0 for homepage, 0.8 for rankings/programmatic pages, 0.6 for restaurant detail pages
**For large sitemaps** (3,500+ URLs), split into sitemap index + multiple sitemap files (max 50,000 URLs per file, but split at 1,000 for faster loading).
**Also create/update `robots.txt`** to reference the sitemap: `Sitemap: https://trycleanplate.com/sitemap.xml`

### Task S5: Ensure all pages use proper heading hierarchy
**What:** Audit all pages for proper H1/H2/H3 structure.
- Every page should have exactly ONE `<h1>` tag
- Homepage h1: "Search Less. Eat Gluten-Free with Confidence." (or current hero text)
- Rankings h1: "Top Gluten-Free Restaurants in [City]" (dynamic)
- Restaurant detail h1: "[Restaurant Name]" 
- Subheadings (Signal Breakdown, Reviews, Info) should be `<h2>`
- Do NOT use heading tags for styling purposes — only for semantic structure
**Check that no page has multiple h1 tags or skipped heading levels** (e.g., h1 → h3 with no h2).

---

## Phase 2: Programmatic Landing Pages

### Task S6: Create neighborhood + category landing pages
**What:** Generate SEO landing pages for high-value search queries by combining neighborhoods, food categories, and place types.
**Page URL structure:** `/gluten-free/[city]/[neighborhood]/[optional-category]`
**Examples:**
- `/gluten-free/nyc/east-village` → "Best Gluten-Free Restaurants in East Village, NYC"
- `/gluten-free/nyc/east-village/pizza` → "Best Gluten-Free Pizza in East Village, NYC"
- `/gluten-free/nyc/williamsburg/bakery` → "Best Gluten-Free Bakeries in Williamsburg, NYC"
- `/gluten-free/nyc/upper-west-side` → "Best Gluten-Free Restaurants on the Upper West Side, NYC"

**Page content for each:**
1. H1: "Best Gluten-Free [Category] in [Neighborhood], NYC" (or "Best Gluten-Free Restaurants in [Neighborhood], NYC" if no category)
2. A short intro paragraph (2-3 sentences). Use a template like: "Looking for [gluten-free pizza / celiac-safe restaurants] in [Neighborhood]? CleanPlate rates [X] restaurants in [Neighborhood] based on GF safety signals including cross-contamination risk, dedicated fryers, menu labeling, and real diner experiences."
3. The ranked list of matching restaurants with: name, score, cuisine, 1-line summary, and link to detail page
4. Meta title: "Best Gluten-Free [Category] in [Neighborhood], NYC | CleanPlate"
5. Meta description: "[X] restaurants in [Neighborhood] rated for gluten-free safety. Find places with dedicated GF fryers, clear labeling, and safe preparation."

**Only generate pages for combinations that have 3+ restaurants.** Don't create empty or near-empty pages — Google penalizes thin content.

**Generate pages for these neighborhoods (NYC):**
Use all neighborhoods already in your database. Prioritize the ones with the most restaurants.

**Generate pages for these categories:**
- No category (all GF restaurants in neighborhood)
- GF Pizza
- GF Pasta
- GF Bakery
- GF Breakfast
- Dedicated GF (fully GF restaurants)
- Place types: cafe, bar, fine dining (only where 3+ restaurants exist)

**Add all generated pages to the sitemap (Task S4).**

**Important:** These pages must be server-side rendered (SSR) or statically generated (SSG) so Google can crawl them. Do NOT rely on client-side rendering for the content. In Next.js, use `getStaticProps` + `getStaticPaths` with `fallback: true` or `revalidate` for ISR.

### Task S6b: Add internal linking between programmatic pages
**What:** Each programmatic landing page should link to related pages to help Google discover and understand the site structure.
**At the bottom of each page, add:**
- "Other neighborhoods in NYC": links to 5-6 nearby or popular neighborhood pages
- "Other GF options in [Neighborhood]": links to other category pages for the same neighborhood
- "Explore more": link back to the main rankings page
**On each restaurant detail page, add:**
- "More GF restaurants in [Neighborhood]": link to that neighborhood's landing page
- "More [GF Pizza/Bakery/etc.] in NYC": link to the relevant category page (if the restaurant has that tag)

---

## Phase 3: Blog Infrastructure

### Task S7: Create the blog page structure
**What:** Set up a blog at `/blog` with:
- Blog index page at `/blog` showing all posts in reverse chronological order
- Individual post pages at `/blog/[slug]`
- Use markdown or MDX files in the repo for blog content (easy for the founder to edit)
- Each post needs: title, date, meta description, featured image (optional), and body content
- Blog index should show: post title, date, 2-line excerpt, and link to full post
- Add "Blog" to the site navigation (can be in the footer or secondary nav — don't clutter the main bottom tab bar)
**Style the blog consistently** with the existing site design (dark theme, same typography).
**Do NOT write any blog posts** — just create the infrastructure and a sample post template showing the expected format.

### Task S8: Create blog post template file
**What:** Create a sample template file at `/content/blog/_TEMPLATE.md` with this structure:
```
---
title: "Your Post Title Here"
slug: "your-post-title-here"
date: "2026-04-15"
description: "Meta description for SEO (under 160 characters)"
---

Write your post content here in markdown.

## Subheading

More content...

[Link to relevant CleanPlate page](/gluten-free/nyc/east-village)
```
**Also create a README** in the content/blog folder explaining how to add a new post.

---

## Phase 4: Quick Wins

### Task S9: Add canonical URLs to all pages
**What:** Every page should have a `<link rel="canonical" href="...">` tag in the head pointing to its own canonical URL. This prevents duplicate content issues from query params, trailing slashes, etc.
**For paginated pages** (rankings with ?page=2), the canonical should point to the first page (no page param) OR each page can be self-canonical — choose the approach that makes sense for your pagination strategy.

### Task S10: Optimize page load speed for Core Web Vitals
**What:** Google uses Core Web Vitals as a ranking factor. Audit and fix:
- Add `next/image` for all images (automatic lazy loading + optimization)
- Ensure fonts are preloaded with `font-display: swap`
- Check for layout shift caused by dynamically loaded content (add skeleton loaders or fixed dimensions)
- Minimize JavaScript bundle size — check if any large libraries are loaded unnecessarily
- Run Lighthouse on the homepage, a restaurant detail page, and the rankings page. Target 80+ performance score on mobile.

---

## Suggested Blog Post Topics (for the founder to write)

These are topic ideas that target high-value search queries. Write these yourself or use them as outlines to draft with AI assistance, then edit heavily in your own voice.

1. **"The Complete Guide to Celiac-Safe Dining in NYC (2026)"**
   Target query: "gluten free NYC", "celiac safe restaurants NYC"
   Link to: neighborhood landing pages, top-rated restaurants

2. **"Which NYC Neighborhoods Are Best for Gluten-Free Dining?"**
   Target query: "best neighborhood gluten free NYC"
   Link to: each neighborhood landing page
   Use your actual data to rank neighborhoods by number of high-scoring restaurants.

3. **"How We Rate Restaurants: CleanPlate's GF Safety Score Explained"**
   Target query: "how to know if restaurant is safe for celiac"
   Link to: restaurant detail pages as examples
   Builds trust and explains your methodology.

4. **"Best Dedicated Gluten-Free Restaurants in NYC"**
   Target query: "dedicated gluten free restaurant NYC"
   Link to: the Dedicated GF filter on rankings

5. **"Where to Find Gluten-Free Pizza in NYC That's Actually Safe"**
   Target query: "gluten free pizza NYC", "celiac safe pizza NYC"
   Link to: GF pizza programmatic pages by neighborhood

6. **"GF Brunch in NYC: [X] Restaurants Ranked by Safety"**
   Target query: "gluten free brunch NYC"
   Link to: brunch_spot + GF breakfast filtered pages

Write one post every 1-2 weeks. Quality over quantity. Each post should link to at least 3-5 internal CleanPlate pages.
