"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { captureCtaClick, type CtaName, type CtaLocation } from "@/lib/analytics";

/** Anchor that fires `restaurant_cta_clicked` on click, then behaves like a normal <a>. */
export function TrackedCtaLink({
  restaurantId,
  cta,
  location,
  neighborhood,
  children,
  ...anchorProps
}: {
  restaurantId: number;
  cta: CtaName;
  location: CtaLocation;
  neighborhood?: string | null;
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...anchorProps}
      onClick={() => captureCtaClick({ restaurantId, cta, location, neighborhood })}
    >
      {children}
    </a>
  );
}
