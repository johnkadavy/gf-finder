import type { OrderProvider } from "./order-links";

/**
 * Third-party service branding for order links.
 *
 * These are deliberately raw brand colors, not design tokens — same rationale
 * as the hex constants in lib/tokens.ts. Colors are chosen to read on both the
 * dark and light modal surface; tweak freely. Uncertain/near-black brands fall
 * back to a neutral token so they stay legible in both themes.
 *
 * Real service logos are trademarked. To show an actual logo, drop that service's
 * official SVG (from its brand/press kit) into /public/brands/<provider>.svg —
 * OrderMenu auto-detects the file and renders the image instead of the branded
 * text. No code change needed; providers with no file keep the branded text.
 */
export type OrderBrand = { label: string; color: string };

export const ORDER_BRANDS: Record<OrderProvider, OrderBrand> = {
  ubereats: { label: "Uber Eats",   color: "#06C167" },
  doordash: { label: "DoorDash",    color: "#FF3008" },
  grubhub:  { label: "Grubhub",     color: "#F63440" },
  seamless: { label: "Seamless",    color: "#FF8000" },
  toast:    { label: "Toast",       color: "#FF4C00" },
  chownow:  { label: "ChowNow",     color: "#EF4E23" },
  slice:    { label: "Slice",       color: "#E02A35" },
  caviar:   { label: "Caviar",      color: "var(--text-primary)" }, // brand is black/white — neutral
  direct:   { label: "Order Direct", color: "var(--accent)" },
  other:    { label: "Order Online", color: "var(--text-primary)" },
};
