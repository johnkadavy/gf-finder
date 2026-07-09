"use client";

import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { capture } from "@/lib/analytics";

// Filter params we care about for analytics. `limit` is excluded on purpose —
// it only changes on "load more" pagination, which isn't a filter application.
const FILTER_KEYS = [
  "region",
  "city",
  "neighborhood",
  "cuisine",
  "placeType",
  "gfCategory",
  "priceLevel",
  "fryer",
  "labeled",
  "experience",
] as const;

/**
 * Fires a single `rankings_filter_applied` event whenever the active filter set
 * changes (via dropdowns, toggles, pills, or the mobile sheet — all of which
 * navigate by URL). Skips the initial page load and load-more pagination.
 */
export function FilterAnalytics() {
  const searchParams = useSearchParams();
  const prevKey = useRef<string | null>(null);

  useEffect(() => {
    const active: Record<string, string> = {};
    for (const key of FILTER_KEYS) {
      const value = searchParams.get(key);
      if (value) active[key] = value;
    }
    const key = JSON.stringify(active);

    // Skip the first render (page load / pageview, not a filter change).
    if (prevKey.current === null) {
      prevKey.current = key;
      return;
    }
    if (key === prevKey.current) return;
    prevKey.current = key;

    capture("rankings_filter_applied", { ...active, active_filter_count: Object.keys(active).length });
  }, [searchParams]);

  return null;
}
