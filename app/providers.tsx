"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { createClient } from "@/lib/supabase-browser";

// Microsoft Clarity global (loaded via inline script in layout.tsx)
declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY;
const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let initialized = false;

function initPostHog() {
  if (initialized || typeof window === "undefined" || !POSTHOG_KEY) return;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // We capture pageviews manually below to handle App Router client navigation.
    capture_pageview: false,
    capture_pageleave: true,
    persistence: "localStorage+cookie",
  });
  initialized = true;
}

/** Fires a pageview on initial load and on every client-side route change. */
function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!POSTHOG_KEY || !pathname) return;
    let url = window.origin + pathname;
    const qs = searchParams?.toString();
    if (qs) url += `?${qs}`;
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  return null;
}

/**
 * Ties analytics identity to the Supabase user so returning users are
 * recognized across sessions. identify() on login, reset() on logout.
 */
function AnalyticsIdentity() {
  useEffect(() => {
    const supabase = createClient();

    function identify(userId: string | undefined) {
      if (!userId) return;
      if (POSTHOG_KEY) posthog.identify(userId);
      // Tag Clarity replays with the same id so returning-user sessions are filterable.
      window.clarity?.("identify", userId);
    }

    supabase.auth.getUser().then(({ data: { user } }) => identify(user?.id));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") {
        if (POSTHOG_KEY) posthog.reset();
      } else if (session?.user) {
        identify(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <AnalyticsIdentity />
      {children}
    </>
  );
}
