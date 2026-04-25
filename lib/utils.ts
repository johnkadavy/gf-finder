import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const NEW_WINDOW_DAYS = 30;

export function isNewRestaurant(source: string | null | undefined, ingestedAt: string | null | undefined): boolean {
  if (source !== "new_openings" || !ingestedAt) return false;
  const age = Date.now() - new Date(ingestedAt).getTime();
  return age < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Formats a restaurant location for display.
 * - Has neighborhood: "West Village / New York"
 * - No neighborhood, has region: "Montauk / Hamptons"
 * - Neither: "Huntington"
 */
export function formatLocation(
  neighborhood: string | null | undefined,
  city: string,
  region: string | null | undefined,
  sep = " / ",
): string {
  if (neighborhood) return `${neighborhood}${sep}${city}`;
  if (region) return `${city}${sep}${region}`;
  return city;
}
