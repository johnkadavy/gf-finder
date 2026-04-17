// eslint-disable-next-line @typescript-eslint/no-explicit-any
import type { SupabaseClient } from "@supabase/supabase-js";

export const DEFAULT_CITY = "New York";

export type CityAccess = {
  /** Cities this user is allowed to see */
  allowedCities: string[];
  /** City shown by default (first visit / no param) */
  defaultCity: string;
  /** Admins bypass all city restrictions */
  isAdmin: boolean;
  /** True when user has exactly 1 allowed city — hides city selector */
  isSingleCity: boolean;
};

const NYC_ONLY: CityAccess = {
  allowedCities: [DEFAULT_CITY],
  defaultCity: DEFAULT_CITY,
  isAdmin: false,
  isSingleCity: true,
};

/**
 * Loads city access for the given user from their profile.
 * Falls back to NYC-only for guests and users without a profile.
 */
export async function getCityAccess(
  userId: string | undefined,
  client: SupabaseClient<any>, // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<CityAccess> {
  if (!userId) return NYC_ONLY;

  const { data } = await client
    .from("profiles")
    .select("allowed_cities, default_city, is_admin")
    .eq("user_id", userId)
    .single();

  if (!data) return NYC_ONLY;

  const isAdmin: boolean = data.is_admin ?? false;
  const allowedCities: string[] = data.allowed_cities?.length
    ? data.allowed_cities
    : [DEFAULT_CITY];
  const defaultCity: string = data.default_city ?? DEFAULT_CITY;

  return {
    allowedCities,
    defaultCity,
    isAdmin,
    // Admins are never "single city" — they can query anything
    isSingleCity: !isAdmin && allowedCities.length === 1,
  };
}

/**
 * Validates and resolves a city URL param against the user's access.
 *
 * - Single-city users are always pinned to their city (param is ignored).
 * - Multi-city users can request "all" (their full allowed set) or any city they have.
 * - Admins can request any city string.
 * - Invalid params fall back to the user's defaultCity.
 */
export function resolveCity(
  param: string | undefined,
  access: CityAccess,
): string {
  // Single-city users: always their city, no choice
  if (access.isSingleCity) return access.defaultCity;
  // No param / explicit "all": show all their cities
  if (!param || param === "all") return "all";
  // Admins can request anything
  if (access.isAdmin) return param;
  // Multi-city users: param must be in their allowed list
  return access.allowedCities.includes(param) ? param : access.defaultCity;
}

/**
 * Returns the list of cities to show in city selector dropdowns.
 * Returns [] for single-city users (hides the selector entirely).
 * Admins see the full DB-derived list; others see only their allowed cities.
 */
export function getSelectableCities(
  access: CityAccess,
  allDbCities: string[],
): string[] {
  if (access.isSingleCity) return [];
  if (access.isAdmin) return allDbCities;
  return access.allowedCities;
}
