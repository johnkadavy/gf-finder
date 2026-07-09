/**
 * Fetch wrapper for Supabase clients that logs oversized responses, so egress
 * spikes are attributable within Supabase's 1-day log retention. Logs the
 * request path only (never query params). Server-side only — silent no-op in
 * the browser to avoid console noise.
 */
const WARN_BYTES = 500_000;

export const egressLoggingFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);

  if (typeof window === "undefined") {
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > WARN_BYTES) {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const path = url.split("?")[0];
      console.warn(`[supabase-egress] ${(len / 1024).toFixed(0)}KB response from ${path}`);
    }
  }

  return res;
};
