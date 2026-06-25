import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase-admin";
import { buildDigestEmail } from "@/lib/email/digest";
import type { DigestRestaurant } from "@/lib/email/digest";

// TODO (revisit when follower count reaches a few hundred):
// - Concurrency guard: prevent duplicate sends if two cron invocations overlap
//   (e.g. Vercel fires a retry before the first completes). A simple approach is
//   a short-TTL lock row in a `cron_locks` table, checked at job start.
// - Resend idempotency key per follow+run: pass idempotencyKey to resend.emails.send()
//   so a network retry doesn't deliver a duplicate email.
// - Batching/queue: if follows grow large enough to approach Vercel's 300s function
//   timeout (~600+ follows at ~500ms each), fan out into a queue (e.g. Inngest or
//   Vercel's own queue) rather than processing everything in one synchronous pass.

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";
const DIGEST_MIN_SCORE = 80;

type FollowRow = {
  id: string;
  email: string;
  follow_type: string;
  follow_target: string;
  confirmation_token: string;
  min_score: number | null;
  cadence: string | null;
};

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { data: follows, error: followsError } = await supabaseServer
    .from("follows")
    .select("id, email, follow_type, follow_target, confirmation_token, min_score, cadence")
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null);

  if (followsError) {
    console.error("[weekly-digest] failed to load follows:", followsError);
    return NextResponse.json({ error: "Failed to load follows." }, { status: 500 });
  }

  const results = { sent: 0, skipped: 0, errors: 0 };

  for (const follow of (follows ?? []) as FollowRow[]) {
    try {
      await processFollow(follow, results);
    } catch (err) {
      results.errors++;
      console.error("[weekly-digest] unhandled error for follow", follow.id, err);
    }
  }

  console.log("[weekly-digest] done", results);
  return NextResponse.json(results);
}

async function processFollow(follow: FollowRow, results: { sent: number; skipped: number; errors: number }) {
  const isMonday = new Date().getDay() === 1;
  if ((follow.cadence ?? 'weekly') === 'weekly' && !isMonday) {
    results.skipped++;
    return;
  }

  const threshold = follow.min_score ?? DIGEST_MIN_SCORE;

  // Find already-notified place IDs for this follow (confirmed sends only)
  const { data: notified } = await supabaseServer
    .from("follow_notifications")
    .select("place_id")
    .eq("follow_id", follow.id)
    .eq("notification_type", "score_above_threshold")
    .not("sent_at", "is", null);

  const notifiedIds = new Set((notified ?? []).map((n: { place_id: number }) => n.place_id));

  const recentCutoff = new Date();
  recentCutoff.setDate(recentCutoff.getDate() - 30);

  // New spots: high-scoring restaurants added in the last 30 days, not yet notified
  const { data: newCandidates } = await supabaseServer
    .from("restaurants")
    .select("id, name, slug, neighborhood, score, dossier")
    .eq("city", "New York")
    .not("score", "is", null)
    .gte("score", threshold)
    .gte("created_at", recentCutoff.toISOString())
    .order("score", { ascending: false });

  const newSpots = ((newCandidates ?? []) as DigestRestaurant[])
    .filter((r) => !notifiedIds.has(r.id));

  // Evergreen: top-scoring spots not yet notified, excluding new spots
  const newSpotIds = new Set(newSpots.map((r) => r.id));
  const { data: evergreenCandidates } = await supabaseServer
    .from("restaurants")
    .select("id, name, slug, neighborhood, score, dossier")
    .eq("city", "New York")
    .not("score", "is", null)
    .gte("score", threshold)
    .order("score", { ascending: false })
    .limit(50);

  const evergreenSpots = ((evergreenCandidates ?? []) as DigestRestaurant[])
    .filter((r) => !notifiedIds.has(r.id) && !newSpotIds.has(r.id));

  // Lead with new spots, pad with evergreen to reach 3
  const qualifying = [
    ...newSpots.slice(0, 3),
    ...evergreenSpots.slice(0, Math.max(0, 3 - newSpots.length)),
  ];

  if (qualifying.length === 0) {
    results.skipped++;
    return;
  }

  // Stage all qualifying places before sending (sent_at = NULL)
  // ON CONFLICT DO NOTHING: re-uses any staged rows from a prior failed run,
  // and ignores rows that are already confirmed (those were excluded above).
  const stagingRows = qualifying.map((r) => ({
    follow_id: follow.id,
    place_id: r.id,
    notification_type: "score_above_threshold",
    sent_at: null,
    score_at_send: r.score,
  }));

  const { error: stageError } = await supabaseServer
    .from("follow_notifications")
    .upsert(stagingRows, { onConflict: "follow_id,place_id,notification_type", ignoreDuplicates: true });

  if (stageError) {
    console.error("[weekly-digest] staging failed for follow", follow.id, stageError);
    results.errors++;
    return;
  }

  // Send the digest email
  const unsubscribeUrl = `${SITE_URL}/api/follows/unsubscribe?token=${follow.confirmation_token}`;
  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: follow.email,
    subject: `Top GF spots in NYC — CleanPlate`,
    html: buildDigestEmail({
      label: "Top GF Spots in NYC",
      restaurants: qualifying,
      unsubscribeUrl,
    }),
  });

  if (emailError) {
    console.error("[weekly-digest] resend error for follow", follow.id, emailError);
    results.errors++;
    // Staged rows remain with sent_at = NULL and will be retried next week
    return;
  }

  // Confirm the send: mark staged rows with sent_at = NOW()
  const qualifyingIds = qualifying.map((r) => r.id);
  const { error: confirmError } = await supabaseServer
    .from("follow_notifications")
    .update({ sent_at: new Date().toISOString() })
    .eq("follow_id", follow.id)
    .eq("notification_type", "score_above_threshold")
    .in("place_id", qualifyingIds)
    .is("sent_at", null);

  if (confirmError) {
    // Email already sent — log for manual inspection but don't increment errors
    // (the user received the email; the worst outcome is a duplicate next week)
    console.error("[weekly-digest] sent_at update failed for follow", follow.id, confirmError);
  }

  results.sent++;
}
