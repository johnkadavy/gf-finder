/**
 * Valid `restaurants.gf_food_categories` tags — every one is displayed
 * (GF_FOOD_LABELS on the restaurant page, GF_SPECIALTY_LABELS in landing copy);
 * the first six also back landing pages and filters (lib/categories.ts).
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
import { aiAnswerLine } from "./ai-json";

export const GF_FOOD_CATEGORIES = [
  "gf_pizza", "gf_pasta", "gf_bread", "gf_baked_goods", "gf_bagels", "gf_beer",
  "gf_fried_items", "gf_desserts", "gf_sandwiches", "gf_buns", "gf_breakfast", "gf_soy_sauce",
] as const;

const VALID = new Set<string>(GF_FOOD_CATEGORIES);

export interface ParsedGfFoodCategories {
  /**
   * Tags to store: valid tags in output order, [] for an explicit "none",
   * or null when the answer had no usable value (leave the stored tags alone).
   */
  tags: string[] | null;
  /** Anything on the answer line that wasn't a valid tag. */
  invalid: string[];
}

export function parseGfFoodCategories(raw: string | null | undefined): ParsedGfFoodCategories {
  // Web-search agents often explain before answering; the list is the last line.
  const answer = aiAnswerLine(raw);
  if (!answer) return { tags: null, invalid: [] };
  if (/^none$/i.test(answer)) return { tags: [], invalid: [] };

  const tags: string[] = [];
  const invalid: string[] = [];
  for (const part of answer.split(",")) {
    const v = part.trim().toLowerCase().replace(/[`*"']/g, "");
    if (!v) continue;
    if (VALID.has(v)) {
      if (!tags.includes(v)) tags.push(v);
    } else if (v !== "none") {
      invalid.push(part.trim());
    }
  }
  return { tags: tags.length ? tags : null, invalid };
}
