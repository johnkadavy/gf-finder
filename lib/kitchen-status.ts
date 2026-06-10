import type { ScoringDossier } from "./score";

export type KitchenStatus = "dedicated" | "shared_careful";

/**
 * Derives kitchen status from the AI dossier.
 *
 * "dedicated"     — explicit dedicated prep area (prep_area "dedicated" | "yes").
 * "shared_careful" — shared kitchen, low or medium cross-contamination risk.
 * null            — insufficient signal to make a claim either way.
 *
 * SAFETY NOTE: "dedicated" must only fire on an explicit prep_area signal.
 * cross_contamination_risk === "low" alone is not sufficient — a careful shared
 * kitchen can earn a low risk rating without being fully dedicated GF.
 * Showing "Dedicated GF" for a non-dedicated kitchen is the most dangerous
 * error this page can make for celiac users.
 *
 * TODO: persist as a computed column `kitchen_status` on the restaurants table
 * once we need server-side filtering or sorting by kitchen status. This
 * derivation is the source of truth until that column exists.
 */
export function deriveKitchenStatus(
  dossier: ScoringDossier | null | undefined,
): KitchenStatus | null {
  const prep = dossier?.operations?.dedicated_equipment?.prep_area;
  const risk = dossier?.operations?.cross_contamination_risk;

  if (prep === "dedicated" || prep === "yes") return "dedicated";
  if (risk === "low" || risk === "medium") return "shared_careful";
  return null;
}
