"use client";

import type { AnchorHTMLAttributes, ReactNode } from "react";
import { captureCtaClick, type CtaName, type CtaLocation } from "@/lib/analytics";

/** Anchor that fires `restaurant_cta_clicked` on click, then runs any passed onClick. */
export function TrackedCtaLink({
  restaurantId,
  cta,
  location,
  neighborhood,
  provider,
  children,
  onClick,
  ...anchorProps
}: {
  restaurantId: number;
  cta: CtaName;
  location: CtaLocation;
  neighborhood?: string | null;
  provider?: string;
  children: ReactNode;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a
      {...anchorProps}
      onClick={(e) => {
        captureCtaClick({ restaurantId, cta, location, neighborhood, provider });
        onClick?.(e);
      }}
    >
      {children}
    </a>
  );
}
