/**
 * Maps raw AI-generated cuisine strings to canonical display categories.
 * Used client-side so no DB migration is needed — the filter uses .in()
 * with all raw values that normalize to the selected category.
 */

// Canonical categories shown in the filter UI
export const CUISINE_CATEGORIES = [
  "American",
  "Asian Fusion",
  "Bar & Pub",
  "Barbecue",
  "Burgers",
  "Café & Brunch",
  "Caribbean",
  "Chinese",
  "French",
  "Indian",
  "Italian",
  "Japanese",
  "Korean",
  "Latin American",
  "Mediterranean",
  "Mexican",
  "Peruvian",
  "Seafood",
  "Spanish",
  "Steakhouse",
  "Thai",
  "Vegan / Vegetarian",
  "Vietnamese",
] as const;

export type CuisineCategory = (typeof CUISINE_CATEGORIES)[number] | "Other";

export function normalizeCuisine(raw: string): CuisineCategory {
  const s = raw.toLowerCase();

  // Specific cuisines first — order matters when values overlap
  if (/vegan|vegetarian|plant.?based/.test(s))                                        return "Vegan / Vegetarian";
  if (/bbq|barbecue|barbeque/.test(s))                                                return "Barbecue";
  if (/thai/.test(s))                                                                  return "Thai";
  if (/\bjapanese\b|sushi|ramen|izakaya|omakase|udon|yakitori|yakiniku|temaki|onigiri|kaiseki/.test(s)) return "Japanese";
  if (/\bkorean\b/.test(s))                                                            return "Korean";
  if (/vietnamese/.test(s))                                                            return "Vietnamese";
  if (/peruvian/.test(s))                                                              return "Peruvian";
  if (/chinese|sichuan|szechuan|cantonese|shanghainese|dim sum|dumplings?|hong kong|xinjiang|taiwanese/.test(s)) return "Chinese";
  if (/singaporean|malaysian|indonesian|\bpoke\b|hawaiian|filipino|burmese|tibetan/.test(s)) return "Asian Fusion";
  if (/\bindian\b|nepalese|himalayan|punjabi/.test(s))                                 return "Indian";
  if (/french|crepe|creperie/.test(s))                                                 return "French";
  if (/italian|pizza/.test(s))                                                         return "Italian";
  if (/mexican|tex.?mex|\btacos?\b|oaxacan|burrito|yucatecan/.test(s))                return "Mexican";
  if (/\bspanish\b|\btapas\b|basque/.test(s))                                         return "Spanish";
  if (/mediterranean|greek|turkish|lebanese|middle eastern|israeli|egyptian|persian|halal/.test(s)) return "Mediterranean";
  if (/seafood/.test(s))                                                               return "Seafood";
  if (/steakhouse/.test(s))                                                            return "Steakhouse";
  if (/burger/.test(s))                                                                return "Burgers";
  if (/caribbean|cuban|jamaican/.test(s))                                              return "Caribbean";
  if (/\blatin\b|brazilian|argentinian|argentine|patagonian|venezuelan|dominican|salvadoran/.test(s)) return "Latin American";
  if (/asian fusion|pan.?asian|modern asian|southeast asian/.test(s))                 return "Asian Fusion";
  if (/southern|soul food|wings?|sandwiches?|\bdeli\b|cheesesteak|fast food|fast casual|american|new american|\bdiner\b/.test(s)) return "American";
  if (/wine bar|pub|gastropub|taproom|beer bar|brewery|brewpub|cocktail bar/.test(s)) return "Bar & Pub";
  if (/cafe|bakery|brunch|breakfast|smoothie|health|salad|bubble tea|dessert/.test(s)) return "Café & Brunch";

  return "Other";
}
