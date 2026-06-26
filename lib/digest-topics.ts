export type TopicType = "neighborhood" | "cuisine" | "place_type";

export type Topic = {
  type: TopicType;
  target: string;
  label: string;
  rankingsUrl: string;
};

export const TOPIC_POOL: Topic[] = [
  // Neighborhoods
  { type: "neighborhood", target: "Upper East Side", label: "Neighborhood Spotlight: Upper East Side", rankingsUrl: "/rankings?neighborhood=Upper%20East%20Side" },
  { type: "neighborhood", target: "West Village", label: "Neighborhood Spotlight: West Village", rankingsUrl: "/rankings?neighborhood=West%20Village" },
  { type: "neighborhood", target: "Williamsburg", label: "Neighborhood Spotlight: Williamsburg", rankingsUrl: "/rankings?neighborhood=Williamsburg" },
  { type: "neighborhood", target: "Upper West Side", label: "Neighborhood Spotlight: Upper West Side", rankingsUrl: "/rankings?neighborhood=Upper%20West%20Side" },
  { type: "neighborhood", target: "East Village", label: "Neighborhood Spotlight: East Village", rankingsUrl: "/rankings?neighborhood=East%20Village" },
  { type: "neighborhood", target: "Hell's Kitchen", label: "Neighborhood Spotlight: Hell's Kitchen", rankingsUrl: "/rankings?neighborhood=Hell%27s%20Kitchen" },
  { type: "neighborhood", target: "Chelsea", label: "Neighborhood Spotlight: Chelsea", rankingsUrl: "/rankings?neighborhood=Chelsea" },
  { type: "neighborhood", target: "Park Slope", label: "Neighborhood Spotlight: Park Slope", rankingsUrl: "/rankings?neighborhood=Park%20Slope" },
  { type: "neighborhood", target: "SoHo", label: "Neighborhood Spotlight: SoHo", rankingsUrl: "/rankings?neighborhood=SoHo" },
  { type: "neighborhood", target: "Astoria", label: "Neighborhood Spotlight: Astoria", rankingsUrl: "/rankings?neighborhood=Astoria" },

  // Cuisines
  { type: "cuisine", target: "Italian", label: "NYC's Best GF Italian", rankingsUrl: "/rankings?cuisine=Italian" },
  { type: "cuisine", target: "Thai", label: "NYC's Best GF Thai", rankingsUrl: "/rankings?cuisine=Thai" },
  { type: "cuisine", target: "Mexican", label: "NYC's Best GF Mexican", rankingsUrl: "/rankings?cuisine=Mexican" },
  { type: "cuisine", target: "Japanese", label: "NYC's Best GF Japanese", rankingsUrl: "/rankings?cuisine=Japanese" },
  { type: "cuisine", target: "Mediterranean", label: "NYC's Best GF Mediterranean", rankingsUrl: "/rankings?cuisine=Mediterranean" },
  { type: "cuisine", target: "Chinese", label: "NYC's Best GF Chinese", rankingsUrl: "/rankings?cuisine=Chinese" },
  { type: "cuisine", target: "Indian", label: "NYC's Best GF Indian", rankingsUrl: "/rankings?cuisine=Indian" },
  { type: "cuisine", target: "Korean", label: "NYC's Best GF Korean", rankingsUrl: "/rankings?cuisine=Korean" },
  { type: "cuisine", target: "French", label: "NYC's Best GF French", rankingsUrl: "/rankings?cuisine=French" },
  { type: "cuisine", target: "American", label: "NYC's Best GF American", rankingsUrl: "/rankings?cuisine=American" },

  // Place types
  { type: "place_type", target: "bakery", label: "NYC's Best GF Bakeries", rankingsUrl: "/rankings?placeType=bakery" },
  { type: "place_type", target: "cafe", label: "NYC's Best GF Cafés", rankingsUrl: "/rankings?placeType=cafe" },
];
