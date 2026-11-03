/**
 * Restaurant submission invites (PRIORITIES.md item A).
 *
 * An invite is a per-restaurant link we send through a channel we chose (the
 * email on their website, the Google-listed phone) — holding the link is the
 * ownership check. Only the token's SHA-256 hash is stored, so a DB leak
 * doesn't expose working links.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */
import { createHash, randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

export const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";

/** Bump when a question's meaning changes; stored on every submission. */
export const PROTOCOL_SCHEMA_VERSION = 1;

export function newInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type ResolvedInvite = {
  id: string;
  price_variant: number | null;
  restaurant: {
    id: number;
    name: string;
    display_name: string | null;
    address: string | null;
    slug: string | null;
  };
};

/**
 * Expired and revoked invites still resolve to their restaurant: the Tally
 * link keeps working after expiry, so the webhook keeps those answers (as
 * rejected) instead of losing a restaurant's time.
 */
export type InviteState =
  | { status: "valid" | "expired" | "revoked"; invite: ResolvedInvite }
  | { status: "unknown" };

/**
 * Look up an invite by its raw token. Needs a service-role client —
 * restaurant_invites has RLS on with no policies.
 */
export async function resolveInvite(client: SupabaseClient, token: string): Promise<InviteState> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { status: "unknown" };

  const { data, error } = await client
    .from("restaurant_invites")
    .select("id, price_variant, expires_at, revoked_at, restaurants(id, name, display_name, address, slug)")
    .eq("token_hash", hashInviteToken(token))
    .maybeSingle();

  if (error || !data || !data.restaurants) return { status: "unknown" };

  const invite: ResolvedInvite = {
    id: data.id,
    price_variant: data.price_variant,
    restaurant: data.restaurants as unknown as ResolvedInvite["restaurant"],
  };
  if (data.revoked_at) return { status: "revoked", invite };
  if (new Date(data.expires_at) < new Date()) return { status: "expired", invite };
  return { status: "valid", invite };
}

/**
 * Hidden fields passed to the Tally form. The webhook never trusts these —
 * it re-derives the restaurant from `token` — they only prefill what the
 * restaurant sees.
 */
export function tallyHiddenFields(token: string, invite: ResolvedInvite): Record<string, string> {
  const r = invite.restaurant;
  return {
    token,
    restaurant_id: String(r.id),
    restaurant_name: r.display_name ?? r.name,
    restaurant_address: r.address ?? "",
    listing_url: r.slug ? `${SITE_URL}/restaurant/${r.slug}` : SITE_URL,
    schema_version: String(PROTOCOL_SCHEMA_VERSION),
    price_variant: invite.price_variant != null ? String(invite.price_variant) : "",
  };
}

/** The link we send: the Tally form itself, with hidden fields prefilled. */
export function tallyInviteUrl(formId: string, token: string, invite: ResolvedInvite): string {
  return `https://tally.so/r/${formId}?${new URLSearchParams(tallyHiddenFields(token, invite))}`;
}
