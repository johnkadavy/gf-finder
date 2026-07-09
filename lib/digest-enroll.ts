import type { SupabaseClient } from "@supabase/supabase-js";

export type EnrollResult =
  | "enrolled"          // new confirmed region follow created
  | "confirmed_pending" // had unconfirmed follow(s); confirmed them
  | "already_active"    // already a confirmed subscriber
  | "skipped_unsubscribed"; // previously opted out — never resubscribe

/**
 * Enroll a verified email into the digest as a confirmed follow.
 *
 * Used by the auth callback (magic-link verification proves ownership) and the
 * one-time backfill script for pre-existing users.
 *
 * IMPORTANT: writes to the follows table directly (already confirmed) and must
 * NEVER go through POST /api/follows — that route sends a confirmation email.
 * Idempotent; never re-subscribes anyone who has unsubscribed.
 */
export async function enrollInDigest(
  client: SupabaseClient,
  email: string
): Promise<EnrollResult> {
  const { data: rows, error } = await client
    .from("follows")
    .select("id, follow_target, confirmed_at, unsubscribed_at")
    .eq("email", email);
  if (error) throw error;

  if (rows?.some((r) => r.unsubscribed_at)) return "skipped_unsubscribed";
  if (rows?.some((r) => r.confirmed_at)) return "already_active";

  const pending = rows?.filter((r) => !r.confirmed_at) ?? [];
  if (pending.length > 0) {
    const { error: updateError } = await client
      .from("follows")
      .update({ confirmed_at: new Date().toISOString() })
      .in("id", pending.map((r) => r.id));
    if (updateError) throw updateError;
    return "confirmed_pending";
  }

  const { error: upsertError } = await client.from("follows").upsert(
    {
      email,
      follow_type: "region",
      follow_target: "New York City",
      source_page: "signup-auto",
      cadence: "weekly",
      confirmation_token: crypto.randomUUID(),
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
    },
    { onConflict: "email,follow_target" }
  );
  if (upsertError) throw upsertError;
  return "enrolled";
}
