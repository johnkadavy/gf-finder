/**
 * Review restaurant submissions (PRIORITIES.md item A).
 *
 * Usage:
 *   npx tsx scripts/review-submission.ts --list                 # pending submissions
 *   npx tsx scripts/review-submission.ts --show <id>            # answers, flags, score preview
 *   npx tsx scripts/review-submission.ts --approve <id> [--note "..."]
 *   npx tsx scripts/review-submission.ts --reject <id> --note "why"
 *
 * Approve is the only path from a submission to a listing: it writes
 * `reported_protocol` / `reported_links` / `reported_at` on the restaurant,
 * rescores it, and records score_after. Any previously approved protocol
 * submission for the restaurant becomes `superseded`.
 *
 * <id> may be a full submission id or a unique prefix.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { scoreRestaurant, type ScoringDossier } from "../lib/score";
import { rescoreRestaurants } from "../lib/rescore";
import { protocolFlags, toReportedLinks, toReportedProtocol } from "../lib/reported-protocol";
import type { ProtocolAnswers } from "../lib/tally";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const UPLOAD_BUCKET = "restaurant-uploads";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function fail(msg: string): never {
  console.error(msg);
  process.exit(1);
}

type Submission = {
  id: string;
  restaurant_id: number;
  invite_id: string | null;
  form: "protocol" | "verified_interest";
  schema_version: number;
  answers: unknown;
  status: string;
  review_note: string | null;
  score_before: number | null;
  score_after: number | null;
  submitted_at: string;
};

type RestaurantRow = {
  id: number;
  name: string;
  display_name: string | null;
  slug: string | null;
  score: number | null;
  dossier: unknown;
  cuisine: string | null;
  place_type: string[] | null;
  reported_protocol: unknown;
  website_url: string | null;
  phone: string | null;
  reservation_link: string | null;
  order_links: unknown;
};

const SUBMISSION_COLUMNS = "id, restaurant_id, invite_id, form, schema_version, answers, status, review_note, score_before, score_after, submitted_at";
const RESTAURANT_COLUMNS = "id, name, display_name, slug, score, dossier, cuisine, place_type, reported_protocol, website_url, phone, reservation_link, order_links";

async function findSubmission(ref: string): Promise<Submission> {
  if (/^[0-9a-f-]{36}$/i.test(ref)) {
    const { data, error } = await supabase.from("restaurant_submissions").select(SUBMISSION_COLUMNS).eq("id", ref).maybeSingle();
    if (error) fail(`Lookup failed: ${error.message}`);
    if (!data) fail(`No submission ${ref}`);
    return data as Submission;
  }
  if (!/^[0-9a-f-]{4,}$/i.test(ref)) fail("Submission id must be a uuid or a prefix of at least 4 hex characters");
  // uuid columns don't support LIKE through PostgREST; prefixes are for the
  // recent rows people actually review, so scan those.
  const { data, error } = await supabase
    .from("restaurant_submissions")
    .select(SUBMISSION_COLUMNS)
    .order("submitted_at", { ascending: false })
    .limit(500);
  if (error) fail(`Lookup failed: ${error.message}`);
  const matches = (data as Submission[]).filter((s) => s.id.startsWith(ref.toLowerCase()));
  if (matches.length === 0) fail(`No submission starting with ${ref}`);
  if (matches.length > 1) fail(`${matches.length} submissions start with ${ref} — use more characters`);
  return matches[0];
}

async function getRestaurant(id: number): Promise<RestaurantRow> {
  const { data, error } = await supabase.from("restaurants").select(RESTAURANT_COLUMNS).eq("id", id).single();
  if (error || !data) fail(`Restaurant ${id} not found: ${error?.message}`);
  return data as RestaurantRow;
}

const nameOf = (r: Pick<RestaurantRow, "name" | "display_name">) => r.display_name ?? r.name;
const fmt = (v: unknown) => (v == null || v === "" || (Array.isArray(v) && !v.length) ? "—" : Array.isArray(v) ? v.join(", ") : String(v));

// ── --list ──────────────────────────────────────────────────

async function list() {
  const { data, error } = await supabase
    .from("restaurant_submissions")
    .select(`${SUBMISSION_COLUMNS}, restaurants(name, display_name, score)`)
    .eq("status", "pending")
    .order("submitted_at");
  if (error) fail(`List failed: ${error.message}`);
  if (!data.length) return console.log("No pending submissions.");

  for (const row of data as (Submission & { restaurants: { name: string; display_name: string | null; score: number | null } })[]) {
    const answers = row.answers as ProtocolAnswers;
    const contact = row.form === "protocol" ? [answers.contact?.name, answers.contact?.role].filter(Boolean).join(", ") : "";
    const flagCount =
      row.form === "protocol" ? protocolFlags(answers, (await getRestaurant(row.restaurant_id)).dossier as ScoringDossier | null).length : 0;
    console.log(
      `${row.id.slice(0, 8)}  ${row.submitted_at.slice(0, 10)}  ${row.form.padEnd(17)}  ${nameOf(row.restaurants)} (id ${row.restaurant_id}, score ${row.restaurants.score ?? "—"})` +
        `${contact ? `  · ${contact}` : ""}${flagCount ? `  · ${flagCount} flag${flagCount > 1 ? "s" : ""}` : ""}`
    );
  }
  console.log(`\n${data.length} pending. Inspect one with --show <id>.`);
}

// ── --show ──────────────────────────────────────────────────

async function show(ref: string) {
  const sub = await findSubmission(ref);
  const restaurant = await getRestaurant(sub.restaurant_id);
  const dossier = restaurant.dossier as ScoringDossier | null;

  console.log(`Submission ${sub.id} · ${sub.form} · ${sub.status} · ${sub.submitted_at.slice(0, 16).replace("T", " ")}`);
  console.log(`${nameOf(restaurant)} (id ${restaurant.id}${restaurant.slug ? `, /restaurant/${restaurant.slug}` : ""})`);

  if (sub.invite_id) {
    const { data: invite } = await supabase.from("restaurant_invites").select("channel, sent_to, created_at").eq("id", sub.invite_id).maybeSingle();
    if (invite) console.log(`Invite: ${invite.channel}${invite.sent_to ? ` → ${invite.sent_to}` : ""} (sent ${invite.created_at.slice(0, 10)})`);
  }
  if (sub.review_note) console.log(`Note: ${sub.review_note.replace(/\n/g, "\n      ")}`);

  if (sub.form !== "protocol") {
    console.log("\nAnswers:");
    for (const [q, v] of Object.entries(sub.answers as Record<string, unknown>)) console.log(`  ${q}: ${fmt(v)}`);
    return;
  }

  const a = sub.answers as ProtocolAnswers;
  const o = dossier?.operations;
  const section = (title: string) => console.log(`\n── ${title}`);
  let compareLabel = "dossier";
  const row = (label: string, reported: unknown, compareValue?: unknown) =>
    console.log(`  ${label.padEnd(24)} ${fmt(reported).padEnd(34)}${compareValue !== undefined ? ` ${compareLabel}: ${fmt(compareValue)}` : ""}`);

  section("Contact");
  row("Name / role", [a.contact.name, a.contact.role].filter(Boolean).join(", "));
  row("Email / phone", [a.contact.email, a.contact.phone].filter(Boolean).join(" · "));

  section("Kitchen");
  row("Fully gluten-free", a.kitchen.fully_gf);
  row("Fryer", a.kitchen.fryer, o?.dedicated_equipment?.fryer === true ? "dedicated" : o?.dedicated_equipment?.fryer === false ? "shared" : "unknown");
  row("Prep", a.kitchen.prep, o?.dedicated_equipment?.prep_area ?? "unknown");
  row("Shared with gluten", a.kitchen.shared_with_gluten, o?.cc_signals?.signal ?? o?.cross_contamination_risk ?? "unknown");
  row("Separation notes", a.kitchen.separation_notes);

  section("Order handling & staff");
  row("Flagged-order steps", a.order_handling.steps);
  row("Walkthrough", a.order_handling.walkthrough);
  row("Takeout packed apart", a.order_handling.takeout_packed);
  row("Staff trained", a.staff.trained, o?.staff_knowledge ?? "unknown");
  row("Who / how often", [a.staff.who, a.staff.frequency].filter(Boolean).join(", "));
  row("Training covers", a.staff.training_notes);

  section("Menu & GF options (display only)");
  row("Menu marking", a.menu.marking, dossier?.menu?.gf_labeling ?? "unknown");
  row("Proudest dishes", a.menu.proudest_dishes);
  row("Bread", a.gf_options.bread);
  row("Sauces", a.gf_options.sauces);
  row("Breakfast", a.gf_options.breakfast);
  row("Beverages", a.gf_options.beverages);
  row("Fried", a.gf_options.fried);
  row("Desserts source", a.gf_options.desserts_source);
  row("Menu link", a.menu.menu_link);

  const { data: sources } = await supabase.from("menu_sources").select("storage_path, url").eq("submission_id", sub.id);
  for (const s of sources ?? []) {
    if (!s.storage_path) continue;
    const { data: signed } = await supabase.storage.from(UPLOAD_BUCKET).createSignedUrl(s.storage_path, 3600);
    row("Menu file (1h link)", signed?.signedUrl ?? s.storage_path);
  }

  section("Links (reported → current)");
  compareLabel = "current";
  row("Website", a.links.website, restaurant.website_url);
  row("Guest phone", a.links.guest_phone, restaurant.phone);
  row("Reservations", a.links.reservations, restaurant.reservation_link);
  row("Ordering", a.links.ordering, Array.isArray(restaurant.order_links) ? (restaurant.order_links as { url: string }[]).map((l) => l.url) : null);
  row("Instagram", a.links.instagram);
  row("Page corrections", a.links.page_corrections);

  const flags = protocolFlags(a, dossier);
  section(flags.length ? `Flags (${flags.length})` : "Flags: none");
  for (const f of flags) console.log(`  ! ${f}`);

  const preview = scoreRestaurant({ ...restaurant, reported_protocol: toReportedProtocol(a, sub.id, sub.schema_version) });
  const withoutReport = scoreRestaurant({ ...restaurant, reported_protocol: null });
  section("Score");
  console.log(`  At submission: ${sub.score_before ?? "—"} · now: ${restaurant.score ?? "—"} · without any report: ${withoutReport ?? "—"} · if approved: ${preview ?? "—"}`);
  if (sub.status === "approved") console.log(`  Approved → ${sub.score_after ?? "—"}`);
}

// ── --approve / --reject ────────────────────────────────────

async function approve(ref: string) {
  const sub = await findSubmission(ref);
  if (sub.status !== "pending") fail(`Submission is ${sub.status}, not pending.`);
  if (sub.form !== "protocol") fail("Only protocol submissions can be approved onto a listing; reject interest-form rows once handled.");

  const a = sub.answers as ProtocolAnswers;
  if (!a.attest.publish) fail("The restaurant didn't agree that CleanPlate may publish their answers — reject it and follow up instead.");

  const before = await getRestaurant(sub.restaurant_id);
  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("restaurants")
    .update({
      reported_protocol: toReportedProtocol(a, sub.id, sub.schema_version),
      reported_links: toReportedLinks(a),
      reported_at: now,
    })
    .eq("id", sub.restaurant_id);
  if (upErr) fail(`Restaurant update failed: ${upErr.message}`);

  await rescoreRestaurants(supabase, { ids: [sub.restaurant_id] });
  const after = await getRestaurant(sub.restaurant_id);

  const note = arg("note");
  const { error: subErr } = await supabase
    .from("restaurant_submissions")
    .update({
      status: "approved",
      reviewed_at: now,
      score_after: after.score,
      ...(note ? { review_note: [sub.review_note, note].filter(Boolean).join("\n") } : {}),
    })
    .eq("id", sub.id);
  if (subErr) fail(`Listing updated, but marking the submission approved failed: ${subErr.message}`);

  await supabase
    .from("restaurant_submissions")
    .update({ status: "superseded" })
    .eq("restaurant_id", sub.restaurant_id)
    .eq("form", "protocol")
    .eq("status", "approved")
    .neq("id", sub.id);

  console.log(`Approved ${sub.id} — ${nameOf(after)} score ${before.score ?? "—"} → ${after.score ?? "—"}`);
}

async function reject(ref: string) {
  const note = arg("note") ?? fail("--reject needs --note explaining why");
  const sub = await findSubmission(ref);
  if (sub.status === "approved") fail("Submission is approved and live — approve a newer one to replace it.");
  const { error } = await supabase
    .from("restaurant_submissions")
    .update({
      status: "rejected",
      reviewed_at: new Date().toISOString(),
      review_note: [sub.review_note, note].filter(Boolean).join("\n"),
    })
    .eq("id", sub.id);
  if (error) fail(`Reject failed: ${error.message}`);
  console.log(`Rejected ${sub.id}`);
}

const [action, id] =
  process.argv.includes("--list") ? ["list", ""]
  : arg("show") ? ["show", arg("show")!]
  : arg("approve") ? ["approve", arg("approve")!]
  : arg("reject") ? ["reject", arg("reject")!]
  : fail("Usage: --list | --show <id> | --approve <id> [--note ...] | --reject <id> --note ...");

({ list, show: () => show(id), approve: () => approve(id), reject: () => reject(id) } as Record<string, () => Promise<void>>)
  [action]()
  .catch((e) => fail(String(e)));
