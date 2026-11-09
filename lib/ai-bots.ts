// AI crawler detection + server-side PostHog capture.
//
// Crawlers don't run JS, so client-side PostHog never sees them. middleware.ts
// calls captureAiCrawlerVisit() for every page request and sends an
// `ai_crawler_visit` event straight to PostHog's capture API.
//
// Categories:
//   user_fetch   — a live fetch triggered by a real user's question (best citation proxy)
//   search_index — building the assistant's search index (makes future citations possible)
//   training     — bulk training-data crawl; high volume, sampled to protect the event quota

export type AiBotCategory = "user_fetch" | "search_index" | "training";

export type AiBot = { name: string; category: AiBotCategory };

// Order matters: more specific tokens first (e.g. "OAI-SearchBot" before "GPTBot").
const AI_BOTS: [RegExp, string, AiBotCategory][] = [
  [/ChatGPT-User/i, "ChatGPT-User", "user_fetch"],
  [/Claude-User/i, "Claude-User", "user_fetch"],
  [/Perplexity-User/i, "Perplexity-User", "user_fetch"],
  [/MistralAI-User/i, "MistralAI-User", "user_fetch"],
  [/DuckAssistBot/i, "DuckAssistBot", "user_fetch"],

  [/OAI-SearchBot/i, "OAI-SearchBot", "search_index"],
  [/Claude-SearchBot/i, "Claude-SearchBot", "search_index"],
  [/PerplexityBot/i, "PerplexityBot", "search_index"],
  [/YouBot/i, "YouBot", "search_index"],

  [/GPTBot/i, "GPTBot", "training"],
  [/ClaudeBot/i, "ClaudeBot", "training"],
  [/anthropic-ai/i, "anthropic-ai", "training"],
  [/CCBot/i, "CCBot", "training"],
  [/Bytespider/i, "Bytespider", "training"],
  [/Applebot-Extended/i, "Applebot-Extended", "training"],
  [/meta-externalagent/i, "meta-externalagent", "training"],
  [/Amazonbot/i, "Amazonbot", "training"],
  [/cohere-ai/i, "cohere-ai", "training"],
];

// Fraction of training-crawler hits to record. Each recorded event carries
// `sample_rate` so counts can be scaled back up (count / sample_rate).
const TRAINING_SAMPLE_RATE = 0.1;

const POSTHOG_CAPTURE_URL = "https://us.i.posthog.com/i/v0/e/";

export function matchAiBot(userAgent: string | null): AiBot | null {
  if (!userAgent) return null;
  for (const [pattern, name, category] of AI_BOTS) {
    if (pattern.test(userAgent)) return { name, category };
  }
  return null;
}

function classifyPath(pathname: string): { page_type: string; restaurant_slug?: string } {
  const restaurant = pathname.match(/^\/restaurant\/([^/]+)\/?$/);
  if (restaurant) return { page_type: "restaurant", restaurant_slug: decodeURIComponent(restaurant[1]) };
  if (pathname.startsWith("/gluten-free/")) return { page_type: "landing" };
  if (pathname.startsWith("/blog")) return { page_type: "blog" };
  if (pathname.startsWith("/rankings")) return { page_type: "rankings" };
  if (pathname === "/") return { page_type: "home" };
  return { page_type: "other" };
}

/**
 * Returns a capture promise (for event.waitUntil) if the request is from a
 * known AI crawler and survives sampling; otherwise null. Never throws.
 */
export function captureAiCrawlerVisit(
  userAgent: string | null,
  url: URL
): Promise<void> | null {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey) return null;

  const bot = matchAiBot(userAgent);
  if (!bot) return null;

  const sampleRate = bot.category === "training" ? TRAINING_SAMPLE_RATE : 1;
  if (sampleRate < 1 && Math.random() >= sampleRate) return null;

  return fetch(POSTHOG_CAPTURE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: apiKey,
      event: "ai_crawler_visit",
      distinct_id: `bot:${bot.name}`,
      properties: {
        bot: bot.name,
        bot_category: bot.category,
        sample_rate: sampleRate,
        path: url.pathname,
        ...classifyPath(url.pathname),
        user_agent: userAgent,
        $current_url: url.href,
        $process_person_profile: false,
      },
    }),
  })
    .then((res) => {
      if (!res.ok) console.warn("[ai-bots] PostHog capture rejected", res.status);
    })
    .catch((err) => {
      console.warn("[ai-bots] PostHog capture failed", err);
    });
}
