/**
 * Generated intro copy for /gluten-free landing pages.
 *
 * Pure module (relative imports only) shared by:
 *   - scripts/generate-landing-copy.ts: builds fact sheets, prompts Claude, checks, stores
 *   - app/gluten-free/[...slug]:        resolves link tokens when rendering stored copy
 *
 * Shape of the copy (see docs/LANDING_COPY.md): mostly neighborhood character,
 * Infatuation-style, then two linked top spots, then links to related guides.
 *
 * Ground rules:
 *   - Everything comes from plain columns (no dossier reads): name, slug, cuisine,
 *     score, google_rating, dedicated_gf_kitchen, gf_food_categories, place_type.
 *   - "Dedicated / fully gluten-free kitchen" claims only for dedicated_gf_kitchen = "yes".
 *   - Links are tokens ([[kind:target|label]]) that resolve to real links at render
 *     time only if the target still exists.
 */
import { deriveKitchenStatus } from "./kitchen-status";
import { normalizeCuisine } from "./cuisine";
import { CATEGORIES, toSlug, type CategoryDef } from "./categories";

// ── Thresholds ────────────────────────────────────────────────────────────────
export const QUALIFYING_SCORE = 75;        // listed on landing pages (mirrors their notFound rules)
export const MIN_NEIGHBORHOOD = 3;         // /gluten-free/[city]/[nbhd](/[cat])
export const MIN_CITY_CATEGORY = 5;        // /gluten-free/[city]/[cat]

// Spots the intro links to: high safety score AND well reviewed.
export const SPOT_MIN_SCORE = 85;
export const SPOT_MIN_GOOGLE_RATING = 4.4;
export const SPOTS_PER_PAGE = 3;           // offered to the writer; it links two

/**
 * Guides that match how people search ("gluten-free pizza", "brunch", "bars"…),
 * in priority order. Only these get generated copy and only these are linked.
 * Pasta, desserts, fryer and the "dedicated" proxy guide keep their template.
 */
export const INTENT_CATEGORIES = ["pizza", "breakfast", "bar", "cafe", "bakery", "fine-dining"]
  .filter((c) => CATEGORIES[c]);

// ── Types ─────────────────────────────────────────────────────────────────────

/** One restaurant row — plain columns only, no dossier. */
export type CopyRow = {
  id: number;
  name: string;
  display_name: string | null;
  slug: string | null;
  city: string;
  neighborhood: string | null;
  score: number;
  cuisine: string | null;
  google_rating: number | null;
  dedicated_gf_kitchen: string | null;
  gf_food_categories: string[] | null;
  place_type: string[] | null;
  lat: number | null;
  lng: number | null;
};

/** Minimal row shape needed to know which landing pages exist. */
export type IndexRow = {
  neighborhood: string | null;
  gf_food_categories: string[] | null;
  place_type: string[] | null;
  /** only needed for fryer/dedicated guides, which copy never targets */
  fryer?: unknown;
  ccr?: unknown;
};

export type CityLandingIndex = {
  citySlug: string;
  /** nbhd slug → { name, count } */
  neighborhoods: Record<string, { name: string; count: number }>;
  /** category slug → count (city-level guides that exist) */
  categories: Record<string, number>;
  /** "nbhdSlug/cat" → count (neighborhood guides that exist) */
  neighborhoodCategories: Record<string, number>;
};

export type PageKind = "neighborhood" | "neighborhood-category" | "city-category";

export type PageSpec = {
  /** path after /gluten-free/, e.g. "new-york/west-village/pizza" (landing_copy.path) */
  path: string;
  kind: PageKind;
  city: string;
  citySlug: string;
  neighborhood?: string;
  nbhdSlug?: string;
  category?: string;
};

export type LinkKind = "restaurant" | "guide" | "nbhd" | "city-guide" | "nbhd-guide";

export type LinkCandidate = {
  /** e.g. "guide:pizza", "nbhd:greenwich-village", "city-guide:bar", "nbhd-guide:soho/pizza" */
  token: string;
  /** what the page is, for the writer, e.g. "GF Pizza Spots in West Village" */
  describes: string;
};

export type Spot = {
  name: string;
  /** "restaurant:<slug>" */
  token: string;
  cuisine: string | null;
  /** dedicated_gf_kitchen = "yes": the only basis for a dedicated-kitchen claim */
  dedicated_gf_kitchen: boolean;
  /** up to two, from gf_food_categories */
  gf_specialties: string[];
};

export type FactSheet = {
  page: { kind: PageKind; city: string; neighborhood?: string; category?: string };
  /** up to SPOTS_PER_PAGE, best first. May be empty → character + guide links only. */
  spots: Spot[];
  links: LinkCandidate[];
  length: "short" | "standard";
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const displayName = (r: CopyRow) => r.display_name ?? r.name;

const GF_SPECIALTY_LABELS: Record<string, string> = {
  gf_pizza: "gluten-free pizza", gf_pasta: "gluten-free pasta", gf_bread: "gluten-free bread",
  gf_baked_goods: "gluten-free pastries", gf_bagels: "gluten-free bagels", gf_beer: "gluten-free beer",
  gf_fried_items: "gluten-free fried food", gf_desserts: "gluten-free desserts",
  gf_sandwiches: "gluten-free sandwiches", gf_buns: "gluten-free buns",
  gf_breakfast: "gluten-free breakfast", gf_soy_sauce: "gluten-free soy sauce",
};

const cuisineLabel = (raw: string | null): string | null => {
  if (!raw) return null;
  const c = normalizeCuisine(raw.normalize("NFD").replace(/[̀-ͯ]/g, ""));
  return c === "Other" ? raw : c;
};

function indexRowMatches(r: IndexRow, def: CategoryDef): boolean {
  if (def.type === "gf_food" && def.value)    return r.gf_food_categories?.includes(def.value) ?? false;
  if (def.type === "place_type" && def.value) return r.place_type?.includes(def.value) ?? false;
  if (def.type === "fryer")                   return r.fryer === true || r.fryer === "true";
  if (def.type === "dedicated")               return r.ccr === "low";
  return false;
}

/** Does a row belong on the given category page? (mirrors applyCategoryFilter for intent categories) */
export function rowInCategory(r: CopyRow, category: string): boolean {
  const def = CATEGORIES[category];
  return def ? indexRowMatches(r, def) : false;
}

/** Which landing pages exist in a city, from its qualifying (score ≥ 75) rows. */
export function computeCityLandingIndex(citySlug: string, rows: IndexRow[]): CityLandingIndex {
  const neighborhoods: CityLandingIndex["neighborhoods"] = {};
  const categories: Record<string, number> = {};
  const neighborhoodCategories: Record<string, number> = {};
  const nbhdCounts = new Map<string, { name: string; count: number }>();
  const nbhdCat = new Map<string, number>();

  for (const r of rows) {
    const nbSlug = r.neighborhood ? toSlug(r.neighborhood) : null;
    if (nbSlug && r.neighborhood) {
      const cur = nbhdCounts.get(nbSlug) ?? { name: r.neighborhood, count: 0 };
      cur.count++;
      nbhdCounts.set(nbSlug, cur);
    }
    for (const [cat, def] of Object.entries(CATEGORIES)) {
      if (!indexRowMatches(r, def)) continue;
      categories[cat] = (categories[cat] ?? 0) + 1;
      if (nbSlug) nbhdCat.set(`${nbSlug}/${cat}`, (nbhdCat.get(`${nbSlug}/${cat}`) ?? 0) + 1);
    }
  }
  for (const [slug, v] of nbhdCounts) if (v.count >= MIN_NEIGHBORHOOD) neighborhoods[slug] = v;
  for (const [cat, n] of Object.entries(categories)) if (n < MIN_CITY_CATEGORY) delete categories[cat];
  for (const [key, n] of nbhdCat) {
    if (n >= MIN_NEIGHBORHOOD && neighborhoods[key.split("/")[0]]) neighborhoodCategories[key] = n;
  }
  return { citySlug, neighborhoods, categories, neighborhoodCategories };
}

/** Neighborhood centroids from restaurant coordinates, for "nearby" links. */
export function neighborhoodCentroids(
  rows: { neighborhood: string | null; lat: number | null; lng: number | null }[],
): Map<string, { lat: number; lng: number }> {
  const acc = new Map<string, { lat: number; lng: number; n: number }>();
  for (const r of rows) {
    if (!r.neighborhood || r.lat == null || r.lng == null) continue;
    const k = toSlug(r.neighborhood);
    const a = acc.get(k) ?? { lat: 0, lng: 0, n: 0 };
    a.lat += r.lat; a.lng += r.lng; a.n++;
    acc.set(k, a);
  }
  const out = new Map<string, { lat: number; lng: number }>();
  for (const [k, a] of acc) out.set(k, { lat: a.lat / a.n, lng: a.lng / a.n });
  return out;
}

function nearestNeighborhoods(
  slug: string,
  centroids: Map<string, { lat: number; lng: number }>,
  index: CityLandingIndex,
  n: number,
): string[] {
  const me = centroids.get(slug);
  if (!me) return [];
  const cosLat = Math.cos((me.lat * Math.PI) / 180);
  return [...centroids.entries()]
    .filter(([k]) => k !== slug && index.neighborhoods[k])
    .map(([k, c]) => [k, Math.hypot(c.lat - me.lat, (c.lng - me.lng) * cosLat)] as const)
    .sort((a, b) => a[1] - b[1])
    .slice(0, n)
    .map(([k]) => k);
}

// ── Fact sheet ────────────────────────────────────────────────────────────────

/**
 * @param pageRows  the restaurants this page lists (score ≥ 75, filtered to the page,
 *                  capped like the page) — spots are picked from these, so a spot's
 *                  link always resolves on the rendered page.
 */
export function buildFactSheet(
  spec: PageSpec,
  pageRows: CopyRow[],
  index: CityLandingIndex,
  centroids: Map<string, { lat: number; lng: number }>,
): FactSheet {
  const catDef = spec.category ? CATEGORIES[spec.category] : null;

  // Spots: high score and well reviewed, best score first (rating breaks ties)
  const spots: Spot[] = pageRows
    .filter((r) => r.slug && r.score >= SPOT_MIN_SCORE && (r.google_rating ?? 0) >= SPOT_MIN_GOOGLE_RATING)
    .sort((a, b) => b.score - a.score || (b.google_rating ?? 0) - (a.google_rating ?? 0))
    .slice(0, SPOTS_PER_PAGE)
    .map((r) => ({
      name: displayName(r),
      token: `restaurant:${r.slug}`,
      cuisine: cuisineLabel(r.cuisine),
      dedicated_gf_kitchen: deriveKitchenStatus(r.dedicated_gf_kitchen) === "dedicated",
      gf_specialties: (r.gf_food_categories ?? []).map((c) => GF_SPECIALTY_LABELS[c]).filter(Boolean).slice(0, 2),
    }));

  // Guide / neighborhood links, search-intent guides first
  const links: LinkCandidate[] = [];
  const city = spec.city;
  if (spec.kind === "neighborhood" && spec.nbhdSlug) {
    for (const cat of INTENT_CATEGORIES) {
      if (index.neighborhoodCategories[`${spec.nbhdSlug}/${cat}`]) {
        links.push({ token: `guide:${cat}`, describes: `${CATEGORIES[cat].labelPlural} in ${spec.neighborhood}` });
      }
    }
    for (const nb of nearestNeighborhoods(spec.nbhdSlug, centroids, index, 2)) {
      links.push({ token: `nbhd:${nb}`, describes: `${index.neighborhoods[nb].name}, a nearby neighborhood guide` });
    }
  } else if (spec.kind === "neighborhood-category" && spec.nbhdSlug && spec.category) {
    if (index.neighborhoods[spec.nbhdSlug]) {
      links.push({ token: `nbhd:${spec.nbhdSlug}`, describes: `All of ${spec.neighborhood}` });
    }
    if (index.categories[spec.category]) {
      links.push({ token: `city-guide:${spec.category}`, describes: `${catDef!.cityLabelPlural} across ${city}` });
    }
    for (const nb of nearestNeighborhoods(spec.nbhdSlug, centroids, index, 6)) {
      if (index.neighborhoodCategories[`${nb}/${spec.category}`]) {
        links.push({ token: `nbhd-guide:${nb}/${spec.category}`, describes: `${catDef!.labelPlural} in ${index.neighborhoods[nb].name}` });
        break;
      }
    }
  } else if (spec.kind === "city-category" && spec.category) {
    const top = Object.entries(index.neighborhoodCategories)
      .filter(([k]) => k.endsWith(`/${spec.category}`))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 2);
    for (const [k] of top) {
      links.push({ token: `nbhd-guide:${k}`, describes: `${catDef!.labelPlural} in ${index.neighborhoods[k.split("/")[0]].name}` });
    }
    const other = INTENT_CATEGORIES.find((c) => c !== spec.category && index.categories[c]);
    if (other) links.push({ token: `city-guide:${other}`, describes: `${CATEGORIES[other].cityLabelPlural} in ${city}` });
  }

  return {
    page: { kind: spec.kind, city: spec.city, neighborhood: spec.neighborhood, category: catDef?.labelPlural },
    spots,
    links,
    length: pageRows.length < 8 ? "short" : "standard",
  };
}

// ── Tokens ────────────────────────────────────────────────────────────────────

export const TOKEN_RE = /\[\[([a-z-]+):([a-z0-9/-]+)\|([^\]]{1,60})\]\]/g;
const ANY_BRACKETS_RE = /\[\[|\]\]/;

export type CopySegment = { text: string } | { kind: LinkKind; target: string; label: string };

/** Remove markdown emphasis and stray/malformed brackets that aren't valid tokens. */
function cleanText(t: string): string {
  return t.replace(/\*\*|__|`/g, "").replace(/\[\[|\]\]/g, "");
}

export function parseCopy(body: string): CopySegment[][] {
  return body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^\s*(#{1,6}|[-*•]|\d+\.)\s+/gm, "").trim())
    .filter(Boolean)
    .map((p) => {
      const out: CopySegment[] = [];
      let last = 0;
      for (const m of p.matchAll(TOKEN_RE)) {
        if (m.index! > last) out.push({ text: cleanText(p.slice(last, m.index)) });
        out.push({ kind: m[1] as LinkKind, target: m[2], label: m[3] });
        last = m.index! + m[0].length;
      }
      if (last < p.length) out.push({ text: cleanText(p.slice(last)) });
      return out;
    });
}

/**
 * Resolve a token to an href if (and only if) the target page currently
 * exists. Returns null → render the label as plain text.
 */
export function resolveTokenHref(
  seg: { kind: LinkKind; target: string },
  ctx: { citySlug: string; nbhdSlug?: string; index: CityLandingIndex; restaurantSlugs?: Set<string> },
): string | null {
  const { citySlug, nbhdSlug, index, restaurantSlugs } = ctx;
  switch (seg.kind) {
    case "restaurant":
      // Only link restaurants this page actually lists (no extra query, never a dead link)
      return restaurantSlugs?.has(seg.target) ? `/restaurant/${seg.target}` : null;
    case "guide":
      return nbhdSlug && index.neighborhoodCategories[`${nbhdSlug}/${seg.target}`]
        ? `/gluten-free/${citySlug}/${nbhdSlug}/${seg.target}` : null;
    case "nbhd":
      return index.neighborhoods[seg.target] ? `/gluten-free/${citySlug}/${seg.target}` : null;
    case "city-guide":
      return index.categories[seg.target] ? `/gluten-free/${citySlug}/${seg.target}` : null;
    case "nbhd-guide":
      return index.neighborhoodCategories[seg.target] ? `/gluten-free/${citySlug}/${seg.target}` : null;
    default:
      return null;
  }
}

// ── Validation (deterministic — no AI judgment) ───────────────────────────────

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20,
};

const AI_TELLS: [RegExp, string][] = [
  [/\bnestled\b/i, "nestled"], [/\bvibrant\b/i, "vibrant"], [/\bbustling\b/i, "bustling"],
  [/\bhidden gems?\b/i, "hidden gem"], [/\b(culinary|gastronomic) (scene|journey|landscape|adventure|delights?)\b/i, "culinary scene/journey"],
  [/\bfoodie (paradise|haven|heaven)\b/i, "foodie paradise"], [/\btapestry\b/i, "tapestry"], [/\btestament to\b/i, "testament to"],
  [/\bdelve\b/i, "delve"], [/\belevat(e|es|ed|ing)\b/i, "elevate"], [/\bcurated\b/i, "curated"], [/\bboasts?\b/i, "boasts"],
  [/\bin the heart of\b/i, "in the heart of"], [/\blook no further\b/i, "look no further"],
  [/\bsomething for everyone\b/i, "something for everyone"], [/\bwhether you'?re\b/i, "whether you're"],
  [/\b(isn't|is not|it's not|not) just\b[^.]{0,60}\b(it's|it is|but)\b/i, "not just X, it's Y"],
  [/\b(haven|oasis)\b/i, "haven/oasis"],
  // Brochure openers
  [/\b(charming|eclectic|iconic|quintessential|storied|timeless|picturesque)\b/i, "brochure adjective"],
  [/\bat its own pace\b/i, "'moves at its own pace'"],
  [/\bstrong opinions\b/i, "'strong opinions'"],
  [/\b(isn't|is not|that's not|not) a complaint\b|\bin the best way\b/i, "hedged joke"],
  [/^[^.]{0,80}:\s*[^.,]+,\s*[^.,]+,?\s*and\b/i, "opens with a list of scenery"],
  // Redundant framing: every reader eats gluten-free
  [/\b(if|when) you('re| are)? (eat(ing)?|need|keep|follow|avoid(ing)?)\b[^.]{0,25}\bgluten/i, "redundant 'if you eat gluten-free'"],
  [/\bfor (the )?(gluten[- ]free|gf) (diners?|eaters|crowd|folks|people|visitors)\b/i, "redundant 'for gluten-free diners'"],
  // Generic advice the intro shouldn't carry
  [/\bshared\b[^.]{0,90}\b(server|ask|prep|prepared|preparation)\b/i, "generic shared-kitchen advice"],
  [/\b(tell|let) your server\b/i, "generic server advice"],
  // Laundry lists (four or more comma-separated items)
  [/(\b[\w'-]+(?: [\w'-]+){0,2}, ){3,}(and |or )?[\w'-]+/i, "long list of items"],
  // Implies the highlights are all there is
  [/\b(two|three|four|a few|a couple of|a handful of) (spots|places|restaurants|options)\b[^.]{0,30}\b(worth|stand out|deserve)/i, "frames highlights as a count"],
  [/\b(only|just) (two|three|a few|a couple|a handful)\b/i, "implies few options"],
  // Frames the list as general best restaurants rather than best at gluten-free
  [/\b(the ones|the places|the spots|the restaurants) (that are|that're|actually) worth (it|your|the)\b|\bthis list is the ones that are\b/i, "best-restaurants framing (not GF-centric)"],
  [/^\s*[^.!\n]*\?/, "opens with a question"],
  [/\b(in short|all in all|bottom line|overall),/i, "summary closer"],
];

const BANNED = [
  /celiac[- ]safe/i, /safe for (people with )?celiacs?/i, /guarantee/i, /100% safe/i,
  /completely safe/i, /totally safe/i, /risk[- ]free/i, /zero risk/i, /no risk/i,
];

// Words that can make up a "restaurant name" without being distinctive —
// a restaurant literally named "Latin American Restaurant" shouldn't make the
// phrase "Latin American" count as naming it.
const GENERIC_NAME_WORDS = new Set([
  "the", "and", "of", "a", "nyc", "new", "york", "ny", "restaurant", "restaurants", "cafe", "café", "kitchen",
  "bar", "grill", "pizza", "pizzeria", "bakery", "deli", "diner", "bistro", "house", "food", "foods",
  "eatery", "express", "cuisine", "market", "shop", "co", "company", "taqueria", "sushi", "ramen",
  "american", "latin", "italian", "mexican", "chinese", "japanese", "thai", "indian", "french", "korean",
  "vietnamese", "greek", "spanish", "mediterranean", "caribbean", "peruvian", "seafood", "steakhouse",
  "burgers", "burger", "brunch", "vegan", "vegetarian", "asian", "fusion", "bbq", "barbecue", "pub",
]);
const isGenericName = (n: string) =>
  n.toLowerCase().split(/[^a-z0-9é]+/).filter(Boolean).every((w) => GENERIC_NAME_WORDS.has(w));

const NEGATION = /\b(no|none|not|never|without|isn't|aren't|doesn't|don't|n't)\b/i;

const KITCHEN_CLAIM =
  /(dedicated|fully|entirely|100%|completely)\s+(gluten[- ]free|gf)\s+(kitchen|restaurant|spot|menu|bakery|cafe|café)|\b(fully|entirely|100%|completely)\s+gluten[- ]free\b|dedicated (gluten[- ]free |gf )?kitchens?|\b(whole|entire)\s+(kitchen|menu|place)\s+is\s+(gluten[- ]free|gf)\b/i;

export type IssueCategory = "safety" | "accuracy" | "links" | "format" | "style";
export type CopyIssue = { category: IssueCategory; message: string };

/** Severity order for reports — safety first. */
export const ISSUE_CATEGORIES: IssueCategory[] = ["safety", "accuracy", "links", "format", "style"];

/**
 * Diagnostic checks — they never block publishing. Each issue is tagged:
 *   safety   — safety promises; kitchen claims about unverified restaurants
 *   accuracy — restaurants or numbers not in the fact sheet
 *   links    — tokens not offered for this page, malformed brackets
 *   format   — length, markdown
 *   style    — AI-writing tells and off-voice framing
 * @param allNames restaurant names in the city (to catch names that aren't spots)
 */
export function checkCopy(body: string, facts: FactSheet, allNames: string[]): CopyIssue[] {
  const issues: CopyIssue[] = [];
  const add = (category: IssueCategory) => (message: string) => issues.push({ category, message });
  const safety = add("safety"), accuracy = add("accuracy"), links = add("links"), format = add("format"), style = add("style");
  const allowed = new Set([...facts.links.map((l) => l.token), ...facts.spots.map((s) => s.token)]);
  const plain = body.replace(TOKEN_RE, (_m, _k, _t, label) => label);

  // Tokens: well-formed and allowed
  for (const m of body.matchAll(TOKEN_RE)) {
    if (!allowed.has(`${m[1]}:${m[2]}`)) links(`token not allowed: ${m[1]}:${m[2]}`);
  }
  if (ANY_BRACKETS_RE.test(plain)) links("malformed token / stray brackets");

  // Format
  if (/^\s*([#*-]|\d+\.)\s/m.test(body)) format("markdown structure (headers/bullets)");
  if (/\*\*|__|`/.test(body)) format("markdown emphasis");
  const words = plain.split(/\s+/).filter(Boolean).length;
  const [min, max] = facts.length === "short" ? [35, 95] : [75, 135];
  if (words < min || words > max) format(`${words} words, outside ${min}–${max}`);

  // AI-writing tells (see VOICE_GUIDE)
  if (/[—–]/.test(plain)) style("em/en dash");
  for (const [re, label] of AI_TELLS) if (re.test(plain)) style(`AI tell: ${label}`);

  // Banned safety promises
  for (const re of BANNED) if (re.test(plain)) safety(`safety promise: ${re}`);

  // Names: any known restaurant mentioned must be one of the spots
  const factNames = new Set(facts.spots.map((s) => s.name.toLowerCase()));
  const kitchenNames = facts.spots.filter((s) => s.dedicated_gf_kitchen).map((s) => s.name.toLowerCase());
  const lower = plain.toLowerCase();
  const mentioned = new Set<string>();
  // Case-sensitive: restaurant names appear capitalized; avoids flagging
  // ordinary words that happen to be a restaurant's name ("wild", "local").
  for (const n of new Set(allNames)) {
    const ln = n.toLowerCase();
    if (n.length < 4 || isGenericName(n)) continue;
    const re = new RegExp(`(^|[^A-Za-z0-9])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^A-Za-z0-9]|$)`);
    if (re.test(plain)) {
      mentioned.add(ln);
      if (!factNames.has(ln)) accuracy(`mentions restaurant that isn't one of the spots: ${n}`);
    }
  }

  // Numbers: every number must appear in the fact sheet
  // No statistics in this copy: the only numbers allowed are the score
  // thresholds ("75+", "85+", "out of 100") and the count of verified kitchens.
  const factNumbers = new Set<number>([75, 85, 100, kitchenNames.length]);
  for (const m of plain.matchAll(/\b\d+\b/g)) {
    const n = Number(m[0]);
    if (!factNumbers.has(n)) accuracy(`number not in fact sheet: ${n}`);
  }
  for (const m of lower.matchAll(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)\b/g)) {
    const n = NUMBER_WORDS[m[1]];
    // "one of the…", "a couple", "two neighborhoods over" are idiomatic — only
    // check spelled-out counts of four or more here; small counts in kitchen
    // claims are checked below.
    if (n > 3 && !factNumbers.has(n)) accuracy(`number not in fact sheet: ${m[1]}`);
  }

  // Kitchen claims: only about verified dedicated kitchens. Checked per claim:
  // the clause the claim sits in (split on , ;), or — when the claim
  // introduces a list with a colon — everything after it in the sentence.
  for (const sentence of plain.split(/(?<=[.!?])\s+/)) {
    const claimRe = new RegExp(KITCHEN_CLAIM.source, "gi");
    for (const m of sentence.matchAll(claimRe)) {
      const at = m.index!;
      const end = at + m[0].length;
      const colon = sentence.indexOf(":", end);
      const start = Math.max(sentence.lastIndexOf(",", at), sentence.lastIndexOf(";", at)) + 1;
      let stop: number;
      if (colon !== -1 && !/[,;]/.test(sentence.slice(end, colon))) {
        stop = sentence.length;
      } else {
        const nexts = [sentence.indexOf(",", end), sentence.indexOf(";", end)].filter((i) => i !== -1);
        stop = nexts.length ? Math.min(...nexts) : sentence.length;
      }
      let clause = sentence.slice(start, stop).toLowerCase();
      // "…or Sushi Counter, where the whole kitchen is gluten-free": the name sits
      // in the previous comma segment, so widen until a named spot is included.
      if (![...mentioned].some((n) => clause.includes(n)) && start > 0) {
        const prev = sentence.lastIndexOf(",", start - 2) + 1;
        clause = sentence.slice(prev, stop).toLowerCase();
      }
      // "none of them run a dedicated kitchen" is honest, not a claim
      if (NEGATION.test(clause.slice(0, Math.max(0, at - start) + m[0].length))) continue;
      if (kitchenNames.length === 0) {
        safety(`kitchen claim with no verified dedicated kitchens: "${sentence.slice(0, 80)}"`);
        break;
      }
      // A count in the claim ("three run dedicated kitchens") must match the verified list
      const countWord = clause.match(/\b(\d+|two|three|four|five|six|seven|eight|nine|ten)\b/);
      if (countWord) {
        const n = /^\d+$/.test(countWord[1]) ? Number(countWord[1]) : NUMBER_WORDS[countWord[1]];
        if (n !== kitchenNames.length && !/\b(75|85|100)\b/.test(countWord[1])) {
          safety(`kitchen count "${countWord[1]}" doesn't match ${kitchenNames.length} verified dedicated kitchen(s)`);
        }
      }
      for (const name of mentioned) {
        if (clause.includes(name) && !kitchenNames.includes(name)) {
          safety(`kitchen claim about unverified restaurant "${name}"`);
        }
      }
    }
  }

  return issues;
}

// ── Prompt ────────────────────────────────────────────────────────────────────
// Kept free of em/en dashes on purpose: the writer mirrors the prompt's punctuation.

export const VOICE_GUIDE = `CleanPlate voice: an opinionated food guide written by people who eat gluten-free. Think of how The Infatuation opens a neighborhood guide: mostly about the place, a little wry, then a nudge toward where to eat.

STRUCTURE (one paragraph):
1. Two sentences that roast the place a little, the way a funny friend who lives nearby would. Dry, deadpan, affectionate. The first can be about the neighborhood itself; the second should bring it around to eating gluten-free there (menus that are mostly bread, kitchens that should know better, a server who isn't sure what's in the sauce). On a category page (pizza, bars, brunch and so on), roast that scene in this neighborhood or city through the same lens.
2. A short turn that says what this list is: the places here that actually get gluten-free right. Not the best restaurants in the neighborhood, not the ones "worth it" in general. The list is about how well they handle gluten-free. No counts.
3. Point to two of the "spots" as where to start, linking each with its token. Give each one detail at most: if dedicated_gf_kitchen is true, that's the detail (for example "where the whole kitchen is gluten-free"); otherwise one of its gf_specialties or its cuisine. Never list several things about a spot.
4. One closing sentence linking two or three related guides from "links".
If "spots" is empty, skip step 3. On a "short" page, skip step 2 and one spot is enough.

THE OPENING (the part that matters most)
- Pick ONE specific, recognizable truth about the place (who lives there, what it's known for, what people say about it) and exaggerate it slightly. Say it flat, like it's obvious. The second sentence lands the joke on the gluten-free angle: the gap between what the neighborhood thinks of itself and how its kitchens handle gluten-free.
- The whole intro is from the point of view of someone who eats gluten-free. The joke should be one only that reader fully gets.
- Write like a person texting a friend a recommendation, not a guidebook, a brochure or a real estate listing.
- Good: "Harbor Hill is where people move after their second kid and then spend years explaining that it used to be cooler. The brunch lines are long enough to count as a neighborhood activity, and plenty of the places at the front of them still think gluten-free means taking the toast off the plate."
- Good (expensive area): "The rent on Hollis Street is high enough that you'd expect every kitchen on it to know what's in its own sauces. A surprising number still don't."
- Bad (general best-restaurants framing): "Plenty of restaurants here aren't worth it. This list is the ones that are." That's a list of good restaurants; ours is a list of places that get gluten-free right.
- Bad (brochure): "Harbor Hill moves at its own pace: leafy streets, old townhouses, and a crowd with strong opinions about brunch. The restaurants are cozy and a little pricey, which isn't a complaint."
- Never open with a list of scenery ("leafy streets, old townhouses, and..."), never personify the neighborhood ("moves at its own pace", "has a personality"), and don't hedge the joke ("which isn't a complaint", "in the best way").
- Roast the neighborhood, not people's identities: rents, strollers, finance guys, tourists, lines, dogs and the place's self-image are fair game; ethnicity, religion, being poor, age and bodies are not. Affectionate, never mean.
- Stick to well-known reputation. If you don't know anything specific and true about the place, keep the joke general to the type of neighborhood rather than inventing a fact.

VOICE
- Speak as CleanPlate when it fits ("our picks", "where we'd start").
- The reader already eats gluten-free; that's why they're here. Never write "if you eat gluten-free" or "for gluten-free diners". Don't assume celiac disease: write "you", never "celiacs".
- The spots are where to start, not the only good options. Never frame them as all there is.
- No generic advice or caveats (shared kitchens, telling your server, asking about prep).
- Calm about safety, never cute about risk.
- Plain prose. American English. No exclamation marks, no emoji, no markdown.

Avoid the classic tells of AI-written copy:
- No em dashes or en dashes as punctuation. Use a period, comma, colon or parentheses instead.
- No stock travel-writing words: nestled, vibrant, bustling, charming, eclectic, iconic, quintessential, storied, timeless, picturesque, hidden gem, gem, haven, oasis, tapestry, testament, culinary scene, culinary journey, foodie paradise, delve, elevate, curated, boasts, in the heart of, look no further, something for everyone, whether you're X or Y.
- No "it's not just X, it's Y" or "isn't just X" constructions.
- No triplets of adjectives ("cozy, charming and inviting"). One precise word beats three vague ones.
- Don't open with a question, and don't close with a summary line ("In short", "All in all", "Bottom line").
- Vary sentence length and openings; don't start consecutive sentences the same way.`;

// Fictional on purpose: a real neighborhood or restaurant here would go stale as
// data changes (and could nudge the writer about that real page).
const EXAMPLE_FACTS = `{"page":{"kind":"neighborhood","city":"New York","neighborhood":"Harbor Hill"},"spots":[{"name":"Fennel & Rye","token":"restaurant:fennel-and-rye","cuisine":"Café & Brunch","dedicated_gf_kitchen":true,"gf_specialties":["gluten-free pastries","gluten-free breakfast"]},{"name":"Little Ember","token":"restaurant:little-ember","cuisine":"Burgers","dedicated_gf_kitchen":false,"gf_specialties":["gluten-free buns","gluten-free fried food"]},{"name":"Osteria Nove","token":"restaurant:osteria-nove","cuisine":"Italian","dedicated_gf_kitchen":false,"gf_specialties":["gluten-free pasta"]}],"links":[{"token":"guide:pizza","describes":"GF Pizza Spots in Harbor Hill"},{"token":"guide:bar","describes":"Bars in Harbor Hill"},{"token":"nbhd:old-quarter","describes":"Old Quarter, a nearby neighborhood guide"}],"length":"standard"}`;

const EXAMPLE_COPY = `Harbor Hill is where people move after their second kid and then spend years explaining that it used to be cooler. The brunch lines are long enough to count as a neighborhood activity, and plenty of the places at the front of them still think gluten-free means taking the toast off the plate. This list is the ones that actually know what they're doing. If you only have one morning, start at [[restaurant:fennel-and-rye|Fennel & Rye]], where the whole kitchen is gluten-free, or get a burger on a gluten-free bun at [[restaurant:little-ember|Little Ember]]. Once brunch is sorted, see our picks for [[guide:pizza|pizza]] and [[guide:bar|bars]], and next door, [[nbhd:old-quarter|Old Quarter]] has its own list.`;

/** What the writer sees (the fact sheet as-is: it carries no counts or scores). */
export function writerFacts(facts: FactSheet) {
  return facts;
}

/**
 * system = the fixed part (identical for every page, so the script caches it);
 * user   = this page's facts.
 */
export function buildPrompt(facts: FactSheet): { system: string; user: string } {
  const system = `You write the short intro at the top of a CleanPlate landing page: a ranked list of restaurants scored for gluten-free safety.

${VOICE_GUIDE}

HARD RULES
1. Restaurants: only mention restaurants in "spots", and say only what their entry supports. "dedicated_gf_kitchen" and "gf_specialties" are the only sources for anything about gluten-free options.
2. Only say a restaurant has a dedicated or fully gluten-free kitchen if its "dedicated_gf_kitchen" is true. A dedicated fryer is not a dedicated kitchen.
3. The neighborhood or city: general, widely known character only (its feel, streets, crowd, the kind of dining it's known for). Nothing you'd need to look up: no street boundaries, directions, dates, prices, or restaurants not in "spots".
4. No numbers or statistics.
5. Never promise safety ("celiac-safe", "safe for celiacs", "guaranteed", "risk-free"). Scores are a guide, not a guarantee.
6. Links: write tokens exactly as [[token|link text]], using only tokens from "spots" and "links". Link each spot you mention by its own name. Never write URLs.
7. Length: "standard" is 90 to 120 words; "short" is 50 to 80 words. Count your words; never exceed the range.
8. Output only the intro text, as one paragraph. No title, no quotes around it.

EXAMPLE (for voice and structure only; its facts are not today's facts)
Fact sheet:
${EXAMPLE_FACTS}
Intro:
${EXAMPLE_COPY}`;

  const user = `Fact sheet:
${JSON.stringify(writerFacts(facts))}

Write the intro.`;
  return { system, user };
}
