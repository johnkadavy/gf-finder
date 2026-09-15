"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { capture } from "@/lib/analytics";

/** Anchor that fires `restaurant_cta_clicked` on click, then behaves like a normal <a>. */
export function TrackedCtaLink({
  restaurantId,
  cta,
  location,
  children,
  ...anchorProps
}: {
  restaurantId: number;
  cta: "directions" | "website" | "reserve" | "phone";
  location: "hero" | "sticky_bar" | "info_section";
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...anchorProps}
      onClick={() =>
        capture("restaurant_cta_clicked", { restaurant_id: restaurantId, cta, location })
      }
    >
      {children}
    </a>
  );
}
