"use client";

import { useEffect, useRef } from "react";
import { capture } from "@/lib/analytics";

type Props = {
  restaurantId: number;
  name: string;
  score: number | null;
  neighborhood: string | null;
  city: string;
};

/**
 * Fires a single `restaurant_viewed` event when a detail page mounts. Rendered
 * on the server-component page but runs client-side. The ref guard prevents a
 * double-fire under React StrictMode in dev.
 */
export function ViewTracker({ restaurantId, name, score, neighborhood, city }: Props) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    capture("restaurant_viewed", { restaurant_id: restaurantId, name, score, neighborhood, city });
  }, [restaurantId, name, score, neighborhood, city]);

  return null;
}
