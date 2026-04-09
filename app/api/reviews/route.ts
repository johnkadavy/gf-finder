import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { calculateScore } from "@/lib/score";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verified reviewer check
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("is_verified_reviewer")
    .eq("user_id", user.id)
    .single();

  if (!profile?.is_verified_reviewer) {
    return NextResponse.json({ error: "Not a verified reviewer" }, { status: 403 });
  }

  const body = await req.json();
  const {
    restaurant_id,
    google_place_id,
    visit_date,
    staff_knowledge,
    gf_labeling,
    gf_options_level,
    cross_contamination_risk,
    dedicated_fryer,
    overall_sentiment,
    notes,
  } = body;

  if (!restaurant_id || !google_place_id) {
    return NextResponse.json({ error: "restaurant_id and google_place_id are required" }, { status: 400 });
  }

  // Insert review
  const { error: insertError } = await supabaseAdmin
    .from("verified_visits")
    .insert({
      google_place_id,
      user_id: user.id,
      visit_date: visit_date ?? null,
      staff_knowledge: staff_knowledge ?? null,
      gf_labeling: gf_labeling ?? null,
      gf_options_level: gf_options_level ?? null,
      cross_contamination_risk: cross_contamination_risk ?? null,
      dedicated_fryer: dedicated_fryer ?? null,
      overall_sentiment: overall_sentiment ?? null,
      notes: notes ?? null,
      synced_at: new Date().toISOString(),
    });

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  // Recalculate score
  const { data: restaurant } = await supabaseAdmin
    .from("restaurants")
    .select("dossier, verified_data")
    .eq("id", restaurant_id)
    .single();

  if (restaurant?.dossier) {
    const score = calculateScore(restaurant.dossier, restaurant.verified_data ?? undefined);
    if (score !== null) {
      await supabaseAdmin
        .from("restaurants")
        .update({ score })
        .eq("id", restaurant_id);
    }
  }

  return NextResponse.json({ success: true });
}
