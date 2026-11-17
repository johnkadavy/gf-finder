/**
 * Valid `restaurants.place_type` values — the same set offered by the rankings
 * filter (PLACE_TYPE_OPTIONS in app/rankings/utils.ts). The Airtable place_type
 * AI field is constrained to these, plus "none" for closed / non-food businesses.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
export const PLACE_TYPES = [
  "restaurant", "fast_casual", "food_truck",
  "cafe", "bar", "bakery", "pizzeria", "deli",
  "dessert_shop", "juice_bar", "brunch_spot", "fine_dining",
] as const;

const VALID = new Set<string>(PLACE_TYPES);

export interface ParsedPlaceTypes {
  /** Valid types, deduped, in output order. Null when none survived. */
  types: string[] | null;
  /** The AI answered "none": closed, or not a food/drink business. */
  none: boolean;
  /** Anything that wasn't a valid type (prose, unknown labels) — dropped. */
  invalid: string[];
}

export function parsePlaceTypes(raw: string | null | undefined): ParsedPlaceTypes {
  const text = raw?.trim() ?? "";
  if (/^none\.?$/i.test(text)) return { types: null, none: true, invalid: [] };

  const types: string[] = [];
  const invalid: string[] = [];
  for (const part of text.split(",")) {
    const v = part.trim().toLowerCase();
    if (!v) continue;
    if (VALID.has(v)) {
      if (!types.includes(v)) types.push(v);
    } else {
      invalid.push(part.trim());
    }
  }
  return { types: types.length ? types : null, none: false, invalid };
}
