export type Experience = "all" | "good" | "great" | "excellent";

export type Filters = {
  city: string;
  neighborhood: string;
  cuisine: string;
  fryer: boolean;
  labeled: boolean;
  experience: Experience;
  page: number;
};

export const EXPERIENCE_OPTIONS: { label: string; value: Experience; minScore: number }[] = [
  { label: "All",       value: "all",       minScore: 0  },
  { label: "Good+",     value: "good",      minScore: 55 },
  { label: "Great+",    value: "great",     minScore: 75 },
  { label: "Excellent", value: "excellent", minScore: 85 },
];

export function rankingsUrl(f: Filters, overrides: Partial<Filters> = {}) {
  const merged = { ...f, ...overrides };
  const params = new URLSearchParams();
  if (merged.city !== "all")         params.set("city", merged.city);
  if (merged.neighborhood !== "all") params.set("neighborhood", merged.neighborhood);
  if (merged.cuisine !== "all")      params.set("cuisine", merged.cuisine);
  if (merged.fryer)                  params.set("fryer", "1");
  if (merged.labeled)                params.set("labeled", "1");
  if (merged.experience !== "all")   params.set("experience", merged.experience);
  if (merged.page > 1)               params.set("page", String(merged.page));
  const qs = params.toString();
  return `/rankings${qs ? `?${qs}` : ""}`;
}
