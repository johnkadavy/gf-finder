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
  | "home_ask_submitted"
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
