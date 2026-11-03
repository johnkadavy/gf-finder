/**
 * Create a restaurant submission invite link (PRIORITIES.md item A).
 *
 * Usage:
 *   npx tsx scripts/create-invite.ts --restaurant <id|slug> --channel email --sent-to owner@theirsite.com --price 149
 *   npx tsx scripts/create-invite.ts --restaurant joes-pizza --channel phone --sent-to "+1 212 555 0100" --days 14
 *   npx tsx scripts/create-invite.ts --revoke <invite id>
 *
 * --channel   how we reached them: email | phone | in_person | other (required)
 * --sent-to   the address/number we used — must be one WE chose (their website,
 *             the Google-listed phone), never one they gave us
 * --price     verified-listing price shown on the interest form, $/yr (optional)
 * --days      link lifetime, default 30
 * --note      free-text note for yourself
 *
 * Prints the Tally form link (hidden fields prefilled) once. Only the token's hash is stored, so it can't be shown
 * again — create a new invite if it's lost.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { hashInviteToken, newInviteToken, tallyInviteUrl } from "../lib/invites";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const CHANNELS = ["email", "phone", "in_person", "other"] as const;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

async function revoke(id: string) {
  const { data, error } = await supabase
    .from("restaurant_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) fail(`Revoke failed: ${error.message}`);
  if (!data) fail(`No invite with id ${id}`);
  console.log(`Revoked invite ${id}`);
}

async function create() {
  const formId = process.env.TALLY_PROTOCOL_FORM_ID ?? fail("TALLY_PROTOCOL_FORM_ID not set in .env.local");
  const ref = arg("restaurant") ?? fail("Missing --restaurant <id|slug>");
  const channel = arg("channel") ?? fail(`Missing --channel (${CHANNELS.join(" | ")})`);
  if (!(CHANNELS as readonly string[]).includes(channel)) fail(`--channel must be one of: ${CHANNELS.join(", ")}`);
  const sentTo = arg("sent-to") ?? null;
  const price = arg("price") != null ? Number(arg("price")) : null;
  if (price != null && !Number.isInteger(price)) fail("--price must be a whole number of dollars");
  const days = Number(arg("days") ?? 30);
  if (!Number.isFinite(days) || days <= 0) fail("--days must be a positive number");

  const query = supabase.from("restaurants").select("id, name, display_name, address, slug, score");
  const { data: restaurant, error: rErr } = await (/^\d+$/.test(ref) ? query.eq("id", Number(ref)) : query.eq("slug", ref)).maybeSingle();
  if (rErr) fail(`Lookup failed: ${rErr.message}`);
  if (!restaurant) fail(`No restaurant with id or slug "${ref}"`);

  const token = newInviteToken();
  const expiresAt = new Date(Date.now() + days * 86_400_000);
  const { data: invite, error } = await supabase
    .from("restaurant_invites")
    .insert({
      restaurant_id: restaurant.id,
      token_hash: hashInviteToken(token),
      channel,
      sent_to: sentTo,
      price_variant: price,
      note: arg("note") ?? null,
      expires_at: expiresAt.toISOString(),
    })
    .select("id")
    .single();
  if (error) fail(`Insert failed: ${error.message}`);

  const url = tallyInviteUrl(formId, token, { id: invite.id, price_variant: price, restaurant });

  console.log(`${restaurant.display_name ?? restaurant.name} (id ${restaurant.id}, score ${restaurant.score ?? "—"})`);
  console.log(`Invite ${invite.id} · ${channel}${sentTo ? ` → ${sentTo}` : ""} · expires ${expiresAt.toISOString().slice(0, 10)}${price != null ? ` · $${price}/yr` : ""}`);
  console.log(`\n  ${url}\n`);
  console.log("This link is shown once — copy it now.");
}

const revokeId = arg("revoke");
(revokeId ? revoke(revokeId) : create()).catch((e) => fail(String(e)));
