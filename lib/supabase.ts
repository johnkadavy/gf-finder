import { createClient } from "@supabase/supabase-js";
import { egressLoggingFetch } from "./supabase-egress-log";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  { global: { fetch: egressLoggingFetch } }
);