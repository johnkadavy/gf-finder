# CleanPlate — Priorities

_Living doc. Update freely. Last updated: 2026-07-09._

CleanPlate = GF/celiac-safe restaurant discovery (database of places + 0–100 safety scores + email digest). Two jobs at once: (1) a real product with early organic signups, (2) a portfolio piece proving applied-AI product chops for the job search.

## Prioritization lens

1. **Protect & learn from the users you already have.** Signups are trickling in — don't leak them. Make the core loop (find → trust → return via digest) actually work, and instrument it so you can see what's happening.
2. **Build the differentiated, AI-driven asset.** The moat is a GF database no one else has, captured via agentic/computer-use flows. This is also the strongest job-search signal.
3. **Defer polish & expansion** (perf, new modes, broad distribution) until the core loop holds and you can measure it.

## Now (this week)

| # | Item | Why now | Rough effort |
|---|------|---------|------|
| 1 | **Subscription placement review** — audit where follow/subscribe UI lives and optimize for conversion | Currently buried in `/gluten-free/[slug]` ranking pages; unclear if users are finding it. Wrong placement = silent churn before it starts. | S |
| 3 | **Schedule celiac/user interviews** | At <10 users, qualitative signal beats analytics. Directly informs digest voice and what the protocol DB should capture. Keep a steady cadence rather than batching. | S (recurring) |

Digest is in good shape: daily cron, topic rotation, hero images, editorial notes, Claude-drafted copy. Deferred: digest reliability work (locks, idempotency, batching) — revisit at a few hundred followers.

**Analytics — shipped & tabled (2026-07-09).** PostHog instrumented for both logged-in and anonymous behavior (identity stitching via `identify(user.id)`; Microsoft Clarity + Vercel Analytics still running). Events live: `restaurant_viewed`, `restaurant_saved/unsaved`, `save_requires_login`, `agent_query`, `rankings_filter_applied`, `map_search`, `home_ask_submitted`, `signup_cta_clicked`, `login_completed`, `review_submitted`, and the follow funnel (`follow_prompt_impression/submitted/confirmed`, mirrored from Vercel). Event helpers in `lib/analytics.ts` (client) and `lib/analytics-server.ts` (server). Autocapture is on, so clicks/pageviews are also funnel-able without new code. **Now collecting data — revisit once traffic accumulates** (rough trigger: a few dozen signups or ~a month of traffic). Follow-ups when we return: read the acquisition→signup funnel + `login_completed`→`restaurant_saved` retention, decide whether to consolidate on PostHog-only vs. keeping Vercel follow events, and consider a PostHog dashboard for the core loop.

## Next (2–4 weeks)

| # | Item | Why next | Rough effort |
|---|------|----------|------|
| 4 | **Agent eval infra** | Promoted from backlog: two AI surfaces now ship user-facing output (ask agent + Claude-generated digest copy) with zero regression safety. Cases already exist in `evals/agent-eval-cases.md`; needs a runner that scores pass/fail and logs results. Also protects the #1 digest-quality work. | S–M |
| 5 | **Plan restaurant-protocol capture** (differentiated DB) | The actual moat. Start with schema + a small manual pilot before automating. | M (plan), L (build) |
| 6 | **Computer-use flows to capture Instagram data** (GF options, signature dishes) | Feeds the differentiated DB. Judge on data value; portfolio value is a bonus, not the driver. | M–L |
| 7 | **Automated DB refresh cycle** (close-out + score updates) | Data trust. Can stay semi-manual until traffic justifies full automation. | M |

## Later (after the loop holds)

| # | Item | Why later |
|---|------|-----------|
| 5 | **Web performance (FCP, etc.)** | Conversion matters, but premature at current traffic. Revisit once analytics show drop-off. |
| 8 | **"Bar mode"** (GF beers + bites) | Feature expansion — validate the core restaurant loop first. |
| 9 | **Posts in GF groups online** | Distribution is wasted before retention works; turn it on once the digest is solid. |

## Notes / backlog
- **Restaurant imagery** — integrate photos (restaurant exterior, interior, or menu shots) into restaurant detail pages and potentially the ranked list. Sources to investigate: Google Places Photos API, Yelp, direct scraping via computer-use. Licensing and egress cost are the key unknowns.
- **Multi-city strategy** — DB and sitemap contain restaurants outside NYC (Long Island, Hamptons, possibly others). Two paths: (1) clean them up and go NYC-only until the core loop is proven, or (2) build a proper city onboarding/selection experience and lean into multi-city as a feature. Decision depends on whether out-of-city traffic is meaningful; check PostHog/Search Console before acting.
- **Homepage A/B testing** — test variants optimized for different conversion goals: signup, AI agent engagement, email subscription. PostHog feature flags could drive this once there's enough traffic to reach significance.
- **Purpose-built operator agents** — a fleet of Claude agents to run CleanPlate operations: add a specific restaurant on demand, search for newly opened restaurants in a neighborhood, trigger enrichment/scoring for a single place, etc. Replaces ad-hoc script runs with a more conversational ops layer.
- **Swipe UI for mobile** — Tinder-style card swipe to browse restaurants in a neighborhood. Makes mobile exploration more tactile; could replace or complement the ranked list on small screens.
- **Create CleanPlate Substack** — distribution channel for the digest; cross-posts could drive backlinks and audience growth outside the current email list.
- **SEO site structure** — low-impact at current scale; revisit when domain authority grows. Options: lower /gluten-free landing page threshold (75→60) to surface more restaurants; add borough-level aggregate pages for higher-intent keyword targets; noindex <50-score restaurant pages to improve crawl quality signal. Backlinks from GF blogs/publications will move the needle more than any of these.
- **New restaurant detection pipeline** — automatically detect when new restaurants open in NYC and ingest them. Would power "newly opened" signal in the digest and keep the DB fresh without manual neighborhood runs.
- **Agent V2: full chat** (from the retired GF_AGENT_SPEC) — multi-turn conversation with history, saved preferences ("celiac + dairy allergy"), GPS location-awareness, suggested follow-ups. Only after V1 single-shot validates.
- **Agent pricing** (from the retired GF_AGENT_SPEC) — free tier of ~5 queries (limits already enforced in `/api/agent`), premium at ~$7/mo or $60/yr for unlimited queries + saved preferences, gated via Supabase Auth. Revisit once usage justifies it.
- **Onboarding flow** — post-signup modal questionnaire: home city, risk profile (celiac vs. gluten-sensitive vs. preference), top interests (cuisine, neighborhood, place type). Use answers to personalize default filters and seed their first follows.
- **Account page improvements**
- **Logo alignment** — review and fix logo positioning/alignment across pages.
- **About page redesign**
- **Dark / light mode toggle** — user-controlled theme switching, respecting system preference by default.
- **SMS interface for the CleanPlate agent** — text a CleanPlate number from your phone to interact with the agent instead of the mobile web app. Likely Twilio for the SMS layer, routing inbound messages to the existing agent with tool use. Natural fit for on-the-go "is this place safe?" queries.
