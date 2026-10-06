import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { supabaseServer } from "@/lib/supabase-admin";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/lib/feedback";

// "Did this help you decide?" votes from restaurant detail pages. Anonymous.
// One row per (restaurant, browser): a later vote or reason updates it.

const MAX_PER_IP_PER_DAY = 40;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SURFACES = ["mobile_float", "desktop_inline"] as const;

function ipHash(req: Request): string | null {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null;
  if (!ip) return null;
  // Date in the hash → can't be correlated across days; enough for a daily cap.
  const day = new Date().toISOString().slice(0, 10);
  const salt = process.env.FEEDBACK_IP_SALT ?? "cleanplate-feedback";
  return createHash("sha256").update(`${salt}:${ip}:${day}`).digest("hex").slice(0, 32);
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const restaurantId = Number(body.restaurant_id);
  const clientId = typeof body.client_id === "string" ? body.client_id : "";
  const vote = body.vote;
  const reason = body.reason ?? null;
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 500) : "";
  const score = typeof body.score === "number" && Number.isFinite(body.score)
    ? Math.min(100, Math.max(0, Math.round(body.score)))
    : null;
  const surface = SURFACES.includes(body.surface as (typeof SURFACES)[number])
    ? (body.surface as string)
    : null;

  if (!Number.isInteger(restaurantId) || restaurantId <= 0 || !UUID_RE.test(clientId) || (vote !== 1 && vote !== -1)) {
    return NextResponse.json({ error: "Invalid feedback." }, { status: 400 });
  }
  if (reason !== null && !FEEDBACK_REASONS.some((r) => r.value === reason)) {
    return NextResponse.json({ error: "Invalid reason." }, { status: 400 });
  }

  const hash = ipHash(req);
  if (hash) {
    const { count } = await supabaseServer
      .from("restaurant_feedback")
      .select("id", { count: "exact", head: true })
      .eq("ip_hash", hash);
    if ((count ?? 0) >= MAX_PER_IP_PER_DAY) {
      return NextResponse.json({ error: "Too many requests." }, { status: 429 });
    }
  }

  const { error } = await supabaseServer
    .from("restaurant_feedback")
    .upsert(
      {
        restaurant_id: restaurantId,
        client_id: clientId,
        vote,
        // A thumbs-up clears any earlier thumbs-down detail.
        reason: vote === 1 ? null : (reason as FeedbackReason | null),
        note: vote === 1 ? null : note || null,
        score_shown: score,
        surface,
        ip_hash: hash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "restaurant_id,client_id" }
    );

  if (error) {
    console.error("[feedback] upsert error:", error.message);
    return NextResponse.json({ error: "Could not save feedback." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
