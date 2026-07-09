import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-admin";
import { track } from "@vercel/analytics/server";
import { captureServer } from "@/lib/analytics-server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    redirect("/follows/confirmed?status=invalid");
  }

  const { data, error } = await supabaseServer
    .from("follows")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("confirmation_token", token)
    .is("confirmed_at", null)
    .select("id, follow_type, follow_target")
    .maybeSingle();

  if (error || !data) {
    // Token not found or already confirmed
    redirect("/follows/confirmed?status=invalid");
  }

  await track("follow_confirmed", {
    follow_type: data.follow_type,
    follow_target: data.follow_target,
  });

  // Email-link click — no browser session/identity to stitch to, so key on the
  // follow id purely for confirmation volume in PostHog.
  await captureServer(`follow:${data.id}`, "follow_confirmed", {
    follow_type: data.follow_type,
    follow_target: data.follow_target,
  });

  redirect("/follows/confirmed?status=ok");
}
