export type Experience = "all" | "good" | "great" | "excellent";

export type Filters = {
  region: string;
  city: string;
  neighborhood: string;
  cuisine: string;
  placeType: string;
  gfCategory: string;
  fryer: boolean;
  labeled: boolean;
  experience: Experience;
  limit: number;
};

export const GF_CATEGORY_OPTIONS: { label: string; value: string }[] = [
  { label: "GF Pizza",      value: "gf_pizza"        },
  { label: "GF Pasta",      value: "gf_pasta"        },
  { label: "GF Baked Goods", value: "gf_baked_goods" },
  { label: "GF Desserts",   value: "gf_desserts"     },
  { label: "GF Sandwiches", value: "gf_sandwiches"   },
  { label: "GF Breakfast",  value: "gf_breakfast"    },
];

export const PLACE_TYPE_OPTIONS: { label: string; value: string }[] = [
  { label: "Restaurant",  value: "restaurant"  },
  { label: "Bar",         value: "bar"         },
  { label: "Fast Casual", value: "fast_casual" },
  { label: "Brunch Spot", value: "brunch_spot" },
  { label: "Pizzeria",    value: "pizzeria"    },
  { label: "Fine Dining", value: "fine_dining" },
  { label: "Café",        value: "cafe"        },
  { label: "Bakery",      value: "bakery"      },
  { label: "Deli",        value: "deli"        },
  { label: "Food Truck",  value: "food_truck"  },
  { label: "Juice Bar",   value: "juice_bar"   },
  { label: "Dessert Shop",value: "dessert_shop"},
];

export const EXPERIENCE_OPTIONS: { label: string; value: Experience; minScore: number }[] = [
  { label: "All",       value: "all",       minScore: 0  },
  { label: "Good+",     value: "good",      minScore: 55 },
  { label: "Great+",    value: "great",     minScore: 75 },
  { label: "Excellent", value: "excellent", minScore: 85 },
];

export function rankingsUrl(f: Filters, overrides: Partial<Filters> = {}) {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.region !== "all")       params.set("region", merged.region);
  if (merged.city !== "all")         params.set("city", merged.city);
  if (merged.neighborhood !== "all") params.set("neighborhood", merged.neighborhood);
  if (merged.cuisine !== "all")      params.set("cuisine", merged.cuisine);
  if (merged.placeType !== "all")    params.set("placeType", merged.placeType);
  if (merged.gfCategory !== "all")   params.set("gfCategory", merged.gfCategory);
  if (merged.fryer)                  params.set("fryer", "1");
  if (merged.labeled)                params.set("labeled", "1");
  if (merged.experience !== "all")   params.set("experience", merged.experience);
  if (merged.limit > 25)             params.set("limit", String(merged.limit));
  const qs = params.toString();
  return `/rankings${qs ? `?${qs}` : ""}`;
}
