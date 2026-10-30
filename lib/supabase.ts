import { createClient } from "@supabase/supabase-js";
import { egressLoggingFetch } from "./supabase-egress-log";

// Without a timeout a stalled database (e.g. Disk IO budget exhausted) hangs
// every page indefinitely. Aborting surfaces as a normal `{ error }` result, so
// callers that check it fail fast and ISR keeps serving the last good page.
const REQUEST_TIMEOUT_MS = 10_000;

const timeoutFetch: typeof fetch = (input, init) => {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const signal = init?.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  return egressLoggingFetch(input, { ...init, signal });
};

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { global: { fetch: timeoutFetch } }
);
