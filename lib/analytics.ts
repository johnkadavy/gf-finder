"use client";

import posthog from "posthog-js";

/**
 * Client-side analytics event names. Keep this list as the single source of
 * truth so event names don't drift across the codebase.
 */
export type AnalyticsEvent =
  | "restaurant_saved"
  | "restaurant_unsaved"
  | "save_requires_login"
  | "rankings_filter_applied"
  | "map_search"
  | "agent_query"
  | "restaurant_viewed"
  | "restaurant_cta_clicked"
  | "home_ask_submitted"
  | "home_search_submitted"
  | "signup_cta_clicked"
  // Mirrored to PostHog so the email-capture funnel is visible alongside
  // the logged-in events. These also fire to Vercel Analytics via track().
  | "follow_prompt_impression"
  | "follow_submitted";

/**
 * Fire a client-side product-analytics event. No-ops when PostHog isn't
 * configured (e.g. local dev without a key), so call sites never need to guard.
 */
export function capture(
  event: AnalyticsEvent,
  properties?: Record<string, unknown>
) {
  if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return;
  try {
    posthog.capture(event, properties);
  } catch {
    // Analytics must never break a user action.
  }
}

/** CTA identifiers for the `restaurant_cta_clicked` event. */
export type CtaName = "directions" | "website" | "reserve" | "phone";

/** Where on the page a CTA was clicked. */
export type CtaLocation = "hero" | "sticky_bar" | "info_section";

/**
 * Fire a `restaurant_cta_clicked` event. Single source of truth for the
 * event's property shape so call sites (TrackedCtaLink, StickyInfoBar) can't
 * drift apart.
 */
export function captureCtaClick(args: {
  restaurantId: number;
  cta: CtaName;
  location: CtaLocation;
  neighborhood?: string | null;
}) {
  capture("restaurant_cta_clicked", {
    restaurant_id: args.restaurantId,
    cta: args.cta,
    location: args.location,
    neighborhood: args.neighborhood ?? null,
  });
}
