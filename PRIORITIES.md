# CleanPlate — Priorities

_Living doc. Update freely. Last updated: 2026-06-23._

CleanPlate = GF/celiac-safe restaurant discovery (database of places + 0–100 safety scores + email digest). Two jobs at once: (1) a real product with early organic signups, (2) a portfolio piece proving applied-AI product chops for the job search.

## Prioritization lens

1. **Protect & learn from the users you already have.** Signups are trickling in — don't leak them. Make the core loop (find → trust → return via digest) actually work, and instrument it so you can see what's happening.
2. **Build the differentiated, AI-driven asset.** The moat is a GF database no one else has, captured via agentic/computer-use flows. This is also the strongest job-search signal.
3. **Defer polish & expansion** (perf, new modes, broad distribution) until the core loop holds and you can measure it.

## Now (this week)

| # | Item | Why now | Rough effort |
|---|------|---------|------|
| 1 | **Fix the email digest flow** | Only retention loop, and it's buggy — every bug leaks a hard-won signup. Stop the bleeding first. | S–M |
| 2 | **Analytics on logged-in behavior** | Can't prioritize the rest blind. A few signups is exactly when instrumentation pays off. Unblocks everything below. | M |
| 3 | **Schedule celiac/user interviews** | Cheap, high-signal, compounding. Keep a steady cadence rather than batching. | S (recurring) |

## Next (2–4 weeks)

| # | Item | Why next | Rough effort |
|---|------|----------|------|
| 7 | **Computer-use flows to capture Instagram data** (GF options, signature dishes) | Feeds the differentiated DB AND is portfolio gold — agentic AI is exactly the target role. | M–L |
| 4 | **Plan restaurant-protocol capture** (differentiated DB) | The actual moat. Start with schema + a small manual pilot before automating. | M (plan), L (build) |
| 6 | **Automated DB refresh cycle** (close-out + score updates) | Data trust. Can stay semi-manual until traffic justifies full automation. | M |

## Later (after the loop holds)

| # | Item | Why later |
|---|------|-----------|
| 5 | **Web performance (FCP, etc.)** | Conversion matters, but premature at current traffic. Revisit once analytics show drop-off. |
| 8 | **"Bar mode"** (GF beers + bites) | Feature expansion — validate the core restaurant loop first. |
| 9 | **Posts in GF groups online** | Distribution is wasted before retention works; turn it on once the digest is solid. |

## Notes / backlog
- **New restaurant detection pipeline** — automatically detect when new restaurants open in NYC and ingest them. Would power "newly opened" signal in the digest and keep the DB fresh without manual neighborhood runs.
- **Agent eval infra** — eval cases already exist in `evals/agent-eval-cases.md`; need a script that runs them against the live agent, scores pass/fail, and logs results. Catches prompt regressions before they reach users.
- **Onboarding flow** — post-signup modal questionnaire: home city, risk profile (celiac vs. gluten-sensitive vs. preference), top interests (cuisine, neighborhood, place type). Use answers to personalize default filters and seed their first follows.
- **Account page improvements**
- **Logo alignment** — review and fix logo positioning/alignment across pages.
- **About page redesign**
- **Dark / light mode toggle** — user-controlled theme switching, respecting system preference by default.
- **SMS interface for the CleanPlate agent** — text a CleanPlate number from your phone to interact with the agent instead of the mobile web app. Likely Twilio for the SMS layer, routing inbound messages to the existing agent with tool use. Natural fit for on-the-go "is this place safe?" queries.
