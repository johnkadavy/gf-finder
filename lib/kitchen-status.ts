export type KitchenStatus = "dedicated" | "shared";

export function deriveKitchenStatus(
  dedicatedGfKitchen: string | null | undefined,
): KitchenStatus {
  return dedicatedGfKitchen === "yes" ? "dedicated" : "shared";
}
