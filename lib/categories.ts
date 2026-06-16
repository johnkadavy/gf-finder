export type CategoryDef = {
  type: "gf_food" | "place_type" | "fryer" | "dedicated";
  value?: string;
  label: string;
  labelPlural: string;
  cityLabelPlural: string;
  editorialIntro: string;
};

export const CATEGORIES: Record<string, CategoryDef> = {
  "pizza": {
    type: "gf_food", value: "gf_pizza",
    label: "GF Pizza",
    labelPlural: "GF Pizza Spots",
    cityLabelPlural: "Best Gluten-Free Pizza Restaurants",
    editorialIntro: "Finding gluten-free pizza in NYC means more than tracking down a GF crust — it means knowing whether flour is airborne in an open kitchen, whether the dough is prepped on shared surfaces, and whether recent diners have reported getting sick. CleanPlate evaluates each GF pizza spot against cross-contamination signals, dedicated prep practices, and illness reports from the past six months. Every restaurant below has earned a top GF safety score, not just for offering a GF option.",
  },
  "pasta": {
    type: "gf_food", value: "gf_pasta",
    label: "GF Pasta",
    labelPlural: "GF Pasta Restaurants",
    cityLabelPlural: "Best Gluten-Free Pasta Restaurants",
    editorialIntro: "Gluten-free pasta is one of the trickier categories — shared boiling water, flour-dusted prep surfaces, and cross-contact from fresh pasta kitchens are all common hazards. CleanPlate looks at kitchen operations, staff awareness, and real diner illness reports to distinguish restaurants where GF pasta is genuinely safe from places where it's an afterthought. The spots below score in the top tier for GF safety.",
  },
  "bakery": {
    type: "place_type", value: "bakery",
    label: "GF Baked Goods",
    labelPlural: "GF Baked Goods Spots",
    cityLabelPlural: "Best Gluten-Free Bakeries",
    editorialIntro: "Gluten-free baked goods from a shared bakery kitchen carry real risk — flour dust settles on every surface, and many \"GF options\" at conventional bakeries involve meaningful cross-contact. The bakeries and cafés below either operate dedicated gluten-free kitchens or have demonstrated consistently safe practices backed by real diner feedback. These are places where GF means more than just the ingredients list.",
  },
  "breakfast": {
    type: "gf_food", value: "gf_breakfast",
    label: "GF Breakfast",
    labelPlural: "GF Breakfast & Brunch Spots",
    cityLabelPlural: "Best Gluten-Free Breakfast & Brunch Spots",
    editorialIntro: "Brunch kitchens are notoriously high-risk for gluten cross-contact — pancake batters, pastry prep, and shared griddles all create contamination opportunities. CleanPlate scores each spot using cross-contamination signals, menu labeling clarity, and real illness reports, so you can show up knowing the restaurant actually takes it seriously. The places below have earned top marks for GF safety.",
  },
  "desserts": {
    type: "gf_food", value: "gf_desserts",
    label: "GF Desserts",
    labelPlural: "GF Dessert Spots",
    cityLabelPlural: "Best Gluten-Free Desserts",
    editorialIntro: "Gluten-free desserts require a kitchen that takes separation seriously — most baked desserts involve flour, and a single contaminated surface can compromise an otherwise GF item. The spots below have been scored for GF safety and offer desserts that meet a high bar for celiac-safe preparation. Check the score and illness signal before ordering.",
  },
  "fryer": {
    type: "fryer",
    label: "GF Fryer",
    labelPlural: "Restaurants with GF Fryer",
    cityLabelPlural: "Restaurants with a Dedicated Gluten-Free Fryer",
    editorialIntro: "A dedicated gluten-free fryer is one of the clearest safety signals a restaurant can offer. In a shared fryer, even a few breadcrumbs contaminate the oil — meaning nothing fried in it is safe for celiacs. Every restaurant below has a documented dedicated GF fryer, so fried items like fries, wings, or calamari can be ordered with significantly lower cross-contamination risk.",
  },
  "dedicated": {
    type: "dedicated",
    label: "Dedicated GF",
    labelPlural: "Dedicated GF Restaurants",
    cityLabelPlural: "Best Dedicated Gluten-Free Restaurants",
    editorialIntro: "A dedicated gluten-free restaurant eliminates an entire category of risk. No shared flour, no gluten-containing items moving through the kitchen, no guesswork for the staff. The restaurants below have been flagged as dedicated GF or near-dedicated through a combination of AI-analyzed menu content and diner reports, and carry CleanPlate's lowest cross-contamination risk ratings.",
  },
  "cafe": {
    type: "place_type", value: "cafe",
    label: "Café",
    labelPlural: "Cafés",
    cityLabelPlural: "Best Gluten-Free Cafés",
    editorialIntro: "Cafés are a daily ritual for many people, but for gluten-sensitive diners, shared pastry cases, contaminated counters, and unlabeled baked goods create real friction. The cafés below have been scored for GF safety based on menu labeling, cross-contamination risk, and diner reports — places where ordering a coffee and a bite is actually straightforward.",
  },
  "bar": {
    type: "place_type", value: "bar",
    label: "Bar",
    labelPlural: "Bars",
    cityLabelPlural: "Best Gluten-Free Bars",
    editorialIntro: "Most bar food — fried apps, wings, sliders — runs through shared fryers and prep surfaces, making bars one of the harder categories for celiacs. The bars below have demonstrated awareness of cross-contamination risks through dedicated equipment, clear staff knowledge, and safe diner track records. A high score here means you can actually eat, not just drink.",
  },
  "fine-dining": {
    type: "place_type", value: "fine_dining",
    label: "Fine Dining",
    labelPlural: "Fine Dining Restaurants",
    cityLabelPlural: "Best Gluten-Free Fine Dining",
    editorialIntro: "Fine dining restaurants often handle GF requests more carefully than casual spots — knowledgeable staff, separate prep areas, and willingness to modify dishes are common. But even high-end kitchens can slip on shared surfaces or unlabeled sauces. The restaurants below score at the top of CleanPlate's GF safety rankings, making them among the safest upscale dining options in the city.",
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyCategoryFilter(query: any, catDef: CategoryDef): any {
  if (catDef.type === "gf_food" && catDef.value)    return query.contains("gf_food_categories", [catDef.value]);
  if (catDef.type === "place_type" && catDef.value) return query.contains("place_type",         [catDef.value]);
  if (catDef.type === "fryer")     return query.eq("dossier->operations->dedicated_equipment->>fryer", "true");
  if (catDef.type === "dedicated") return query.eq("dossier->operations->>cross_contamination_risk", "low");
  return query;
}

export function toSlug(s: string): string {
  return s
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}
