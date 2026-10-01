import { deriveKitchenStatus } from "@/lib/kitchen-status";
import type { ScoringDossier, VerifiedData } from "@/lib/score";

/**
 * Concrete GF affordances shown as chips on list rows (and used as quick
 * filters on landing pages). Only ever shown when present — never "N/A".
 */
export type HighlightKey = "kitchen" | "fryer" | "labeled";

export const HIGHLIGHT_LABELS: Record<HighlightKey, string> = {
  kitchen: "Dedicated GF kitchen",
  fryer: "Dedicated fryer",
  labeled: "Menu labeled",
};

export function getHighlights(r: {
  dossier?: ScoringDossier | null;
  dedicated_gf_kitchen?: string | null;
  verified_data?: VerifiedData | null;
}): HighlightKey[] {
  const out: HighlightKey[] = [];
  if (deriveKitchenStatus(r.dedicated_gf_kitchen) === "dedicated") out.push("kitchen");
  if (r.dossier?.operations?.dedicated_equipment?.fryer === true) out.push("fryer");
  const labeling = r.verified_data?.menu?.gf_labeling ?? r.dossier?.menu?.gf_labeling;
  if (labeling === "clear") out.push("labeled");
  return out;
}
