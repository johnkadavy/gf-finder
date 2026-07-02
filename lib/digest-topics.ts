export type TopicType = "neighborhood" | "cuisine" | "place_type";

export type Topic = {
  type: TopicType;
  target: string;
  label: string;
  rankingsUrl: string;
  /** Hero illustration served from public/, e.g. "/digest/williamsburg.png" */
  heroImage: string;
};

export const TOPIC_POOL: Topic[] = [
  // Neighborhoods
  { type: "neighborhood", target: "Upper East Side", label: "Neighborhood Spotlight: Upper East Side", rankingsUrl: "/rankings?neighborhood=Upper%20East%20Side", heroImage: "/digest/upper-east-side.png" },
  { type: "neighborhood", target: "West Village", label: "Neighborhood Spotlight: West Village", rankingsUrl: "/rankings?neighborhood=West%20Village", heroImage: "/digest/west-village.png" },
  { type: "neighborhood", target: "Williamsburg", label: "Neighborhood Spotlight: Williamsburg", rankingsUrl: "/rankings?neighborhood=Williamsburg", heroImage: "/digest/williamsburg.png" },
  { type: "neighborhood", target: "Upper West Side", label: "Neighborhood Spotlight: Upper West Side", rankingsUrl: "/rankings?neighborhood=Upper%20West%20Side", heroImage: "/digest/upper-west-side.png" },
  { type: "neighborhood", target: "East Village", label: "Neighborhood Spotlight: East Village", rankingsUrl: "/rankings?neighborhood=East%20Village", heroImage: "/digest/east-village.png" },
  { type: "neighborhood", target: "Hell's Kitchen", label: "Neighborhood Spotlight: Hell's Kitchen", rankingsUrl: "/rankings?neighborhood=Hell%27s%20Kitchen", heroImage: "/digest/hells-kitchen.png" },
  { type: "neighborhood", target: "Chelsea", label: "Neighborhood Spotlight: Chelsea", rankingsUrl: "/rankings?neighborhood=Chelsea", heroImage: "/digest/chelsea.png" },
  { type: "neighborhood", target: "Park Slope", label: "Neighborhood Spotlight: Park Slope", rankingsUrl: "/rankings?neighborhood=Park%20Slope", heroImage: "/digest/park-slope.png" },
  { type: "neighborhood", target: "SoHo", label: "Neighborhood Spotlight: SoHo", rankingsUrl: "/rankings?neighborhood=SoHo", heroImage: "/digest/soho.png" },
  { type: "neighborhood", target: "Astoria", label: "Neighborhood Spotlight: Astoria", rankingsUrl: "/rankings?neighborhood=Astoria", heroImage: "/digest/astoria.png" },
  { type: "neighborhood", target: "Midtown", label: "Neighborhood Spotlight: Midtown", rankingsUrl: "/rankings?neighborhood=Midtown", heroImage: "/digest/midtown.png" },
  { type: "neighborhood", target: "Murray Hill", label: "Neighborhood Spotlight: Murray Hill", rankingsUrl: "/rankings?neighborhood=Murray%20Hill", heroImage: "/digest/murray-hill.png" },
  { type: "neighborhood", target: "Flatiron", label: "Neighborhood Spotlight: Flatiron", rankingsUrl: "/rankings?neighborhood=Flatiron", heroImage: "/digest/flatiron.png" },
  { type: "neighborhood", target: "Financial District", label: "Neighborhood Spotlight: Financial District", rankingsUrl: "/rankings?neighborhood=Financial%20District", heroImage: "/digest/financial-district.png" },
  { type: "neighborhood", target: "NoMad", label: "Neighborhood Spotlight: NoMad", rankingsUrl: "/rankings?neighborhood=NoMad", heroImage: "/digest/nomad.png" },
  { type: "neighborhood", target: "Lower East Side", label: "Neighborhood Spotlight: Lower East Side", rankingsUrl: "/rankings?neighborhood=Lower%20East%20Side", heroImage: "/digest/lower-east-side.png" },
  { type: "neighborhood", target: "Bushwick", label: "Neighborhood Spotlight: Bushwick", rankingsUrl: "/rankings?neighborhood=Bushwick", heroImage: "/digest/bushwick.png" },
  { type: "neighborhood", target: "Greenwich Village", label: "Neighborhood Spotlight: Greenwich Village", rankingsUrl: "/rankings?neighborhood=Greenwich%20Village", heroImage: "/digest/greenwich-village.png" },

  // Cuisines
  { type: "cuisine", target: "Italian", label: "NYC's Best GF Italian", rankingsUrl: "/rankings?cuisine=Italian", heroImage: "/digest/italian.png" },
  { type: "cuisine", target: "Thai", label: "NYC's Best GF Thai", rankingsUrl: "/rankings?cuisine=Thai", heroImage: "/digest/thai.png" },
  { type: "cuisine", target: "Mexican", label: "NYC's Best GF Mexican", rankingsUrl: "/rankings?cuisine=Mexican", heroImage: "/digest/mexican.png" },
  { type: "cuisine", target: "Japanese", label: "NYC's Best GF Japanese", rankingsUrl: "/rankings?cuisine=Japanese", heroImage: "/digest/japanese.png" },
  { type: "cuisine", target: "Mediterranean", label: "NYC's Best GF Mediterranean", rankingsUrl: "/rankings?cuisine=Mediterranean", heroImage: "/digest/mediterranean.png" },
  { type: "cuisine", target: "Chinese", label: "NYC's Best GF Chinese", rankingsUrl: "/rankings?cuisine=Chinese", heroImage: "/digest/chinese.png" },
  { type: "cuisine", target: "Indian", label: "NYC's Best GF Indian", rankingsUrl: "/rankings?cuisine=Indian", heroImage: "/digest/indian.png" },
  { type: "cuisine", target: "Korean", label: "NYC's Best GF Korean", rankingsUrl: "/rankings?cuisine=Korean", heroImage: "/digest/korean.png" },
  { type: "cuisine", target: "French", label: "NYC's Best GF French", rankingsUrl: "/rankings?cuisine=French", heroImage: "/digest/french.png" },
  { type: "cuisine", target: "American", label: "NYC's Best GF American", rankingsUrl: "/rankings?cuisine=American", heroImage: "/digest/american.png" },

  // Place types
  { type: "place_type", target: "bakery", label: "NYC's Best GF Bakeries", rankingsUrl: "/rankings?placeType=bakery", heroImage: "/digest/bakery.png" },
  { type: "place_type", target: "cafe", label: "NYC's Best GF Cafés", rankingsUrl: "/rankings?placeType=cafe", heroImage: "/digest/cafe.png" },
  { type: "place_type", target: "brunch_spot", label: "NYC's Best GF Brunch Spots", rankingsUrl: "/rankings?placeType=brunch_spot", heroImage: "/digest/brunch.png" },
  { type: "place_type", target: "pizzeria", label: "NYC's Best GF Pizzerias", rankingsUrl: "/rankings?placeType=pizzeria", heroImage: "/digest/pizza.png" },
  { type: "place_type", target: "fine_dining", label: "NYC's Best GF Fine Dining", rankingsUrl: "/rankings?placeType=fine_dining", heroImage: "/digest/fine-dining.png" },
  { type: "place_type", target: "bar", label: "NYC's Best GF Bars", rankingsUrl: "/rankings?placeType=bar", heroImage: "/digest/bar.png" },
];
