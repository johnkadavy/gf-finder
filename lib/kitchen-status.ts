export type KitchenStatus = "dedicated" | "shared" | "unverified";

export function deriveKitchenStatus(
  dedicatedGfKitchen: string | null | undefined,
): KitchenStatus | null {
  if (dedicatedGfKitchen === "yes") return "dedicated";
  if (dedicatedGfKitchen === "no") return "shared";
  if (dedicatedGfKitchen === "unverified") return "unverified";
  return null;
}
