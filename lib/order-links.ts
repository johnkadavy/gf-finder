/**
 * Order / delivery links for a restaurant.
 *
 * Sourced from an Airtable AI field that emits a JSON array of {provider, url}.
 * The provider label from the AI is treated as a hint only — we re-derive it
 * from the URL's domain here so it can't drift or be mislabeled. Used by the
 * Airtable sync, the admin add-restaurant route, and the restaurant page.
 */

export const ORDER_PROVIDERS = [
  "ubereats",
  "doordash",
  "grubhub",
  "seamless",
  "caviar",
  "toast",
  "chownow",
  "slice",
  "direct",
  "other",
] as const;

export type OrderProvider = (typeof ORDER_PROVIDERS)[number];

export type OrderLink = { provider: OrderProvider; url: string };

/** Marketplaces where a restaurant has exactly one listing — used for dedup. */
const MARKETPLACES: OrderProvider[] = [
  "ubereats", "doordash", "grubhub", "seamless", "caviar", "toast", "chownow", "slice",
];

/** Button order: send business direct first, then the big marketplaces, then the rest. */
const DISPLAY_ORDER: OrderProvider[] = [
  "direct", "doordash", "ubereats", "grubhub", "seamless", "caviar", "toast", "chownow", "slice", "other",
];

/** Domain fragment → provider. Matched against the hostname (www. stripped). */
const DOMAIN_MAP: [string, OrderProvider][] = [
  ["ubereats.com", "ubereats"],
  ["doordash.com", "doordash"],
  ["grubhub.com", "grubhub"],
  ["seamless.com", "seamless"],
  ["trycaviar.com", "caviar"],
  ["toasttab.com", "toast"],
  ["chownow.com", "chownow"],
  ["slicelife.com", "slice"],
];

const PROVIDER_LABELS: Record<OrderProvider, string> = {
  ubereats: "Uber Eats",
  doordash: "DoorDash",
  grubhub: "Grubhub",
  seamless: "Seamless",
  caviar: "Caviar",
  toast: "Toast",
  chownow: "ChowNow",
  slice: "Slice",
  direct: "Order Online",
  other: "Order Online",
};

export function orderProviderLabel(provider: OrderProvider): string {
  return PROVIDER_LABELS[provider] ?? "Order Online";
}

function coerceProvider(hint?: unknown): OrderProvider {
  const s = typeof hint === "string" ? hint.toLowerCase().trim() : "";
  return (ORDER_PROVIDERS as readonly string[]).includes(s) ? (s as OrderProvider) : "other";
}

/** Derive provider from a URL's domain; fall back to the AI's hint, else "other". */
export function normalizeOrderProvider(url: string, hint?: unknown): OrderProvider {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return coerceProvider(hint);
  }
  for (const [domain, provider] of DOMAIN_MAP) {
    if (host === domain || host.endsWith("." + domain)) return provider;
  }
  return coerceProvider(hint);
}

const TRACKING_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "fbclid", "gclid"];

/** Validate + canonicalize a URL; returns null if not a real http(s) URL. */
function cleanUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  u.hash = "";
  TRACKING_PARAMS.forEach((p) => u.searchParams.delete(p));
  return u.toString();
}

function itemToLink(item: unknown): OrderLink | null {
  if (!item || typeof item !== "object") return null;
  const url = cleanUrl((item as { url?: unknown }).url);
  if (!url) return null;
  return { provider: normalizeOrderProvider(url, (item as { provider?: unknown }).provider), url };
}

function dedupeAndSort(links: OrderLink[]): OrderLink[] {
  const seenUrls = new Set<string>();
  const seenMarketplaces = new Set<OrderProvider>();
  const out: OrderLink[] = [];
  for (const link of links) {
    if (seenUrls.has(link.url)) continue;
    if (MARKETPLACES.includes(link.provider) && seenMarketplaces.has(link.provider)) continue;
    seenUrls.add(link.url);
    if (MARKETPLACES.includes(link.provider)) seenMarketplaces.add(link.provider);
    out.push(link);
  }
  return out.sort(
    (a, b) => DISPLAY_ORDER.indexOf(a.provider) - DISPLAY_ORDER.indexOf(b.provider),
  );
}

/**
 * Tolerantly parse the raw order_links value into clean, deduped, sorted links.
 * Accepts: a JSON string (optionally pretty-printed or code-fenced), an already
 * parsed array (jsonb from Supabase), or an Airtable AI field object {value}.
 * Returns [] for anything empty or malformed — never throws.
 */
export function parseOrderLinks(raw: unknown): OrderLink[] {
  if (raw == null) return [];

  let arr: unknown = null;

  if (Array.isArray(raw)) {
    arr = raw;
  } else {
    let text = typeof raw === "string" ? raw : "";
    if (!text && typeof raw === "object") {
      const v = (raw as { value?: unknown }).value;
      text = typeof v === "string" ? v : "";
    }
    text = text.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
    if (!text || text === "[]") return [];
    try {
      arr = JSON.parse(text);
    } catch {
      return [];
    }
  }

  if (!Array.isArray(arr)) return [];
  const links = arr.map(itemToLink).filter((l): l is OrderLink => l !== null);
  return dedupeAndSort(links);
}
