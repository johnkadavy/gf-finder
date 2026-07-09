import { PostHog } from "posthog-node";

/**
 * Server-side analytics event names. Kept separate from the client list since
 * these fire from route handlers where we already know the authenticated user.
 */
export type ServerAnalyticsEvent = "login_completed" | "review_submitted";

let client: PostHog | null = null;

function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, {
      host: process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com",
      // Serverless: flush each event promptly rather than batching across
      // invocations that may be frozen/killed before a batch is sent.
      flushAt: 1,
      flushInterval: 0,
    });
  }
  return client;
}

/**
 * Capture a server-side event tied to a Supabase user id. Awaits a flush so
 * the event isn't lost when the serverless function returns. Never throws.
 */
export async function captureServer(
  distinctId: string,
  event: ServerAnalyticsEvent,
  properties?: Record<string, unknown>
): Promise<void> {
  const ph = getClient();
  if (!ph) return;
  try {
    ph.capture({ distinctId, event, properties });
    await ph.flush();
  } catch {
    // Analytics must never break the request.
  }
}
