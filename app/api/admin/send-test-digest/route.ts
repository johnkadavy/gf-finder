import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase-server";
import { supabaseServer } from "@/lib/supabase-admin";
import { buildDigestEmail } from "@/lib/email/digest";
import type { DigestRestaurant } from "@/lib/email/digest";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";

export async function POST(req: Request) {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { data: profile } = await serverClient
    .from("profiles")
    .select("is_admin")
    .eq("user_id", user.id)
    .single();
  if (!profile?.is_admin) return new Response("Forbidden", { status: 403 });

  const body = await req.json() as { follow_target?: string; follow_type?: string };
  const { follow_target, follow_type } = body;

  if (!follow_target?.trim() || !follow_type) {
    return NextResponse.json({ error: "follow_target and follow_type are required." }, { status: 400 });
  }

  // Top restaurants for this follow target — sufficient for styling preview.
  // The automated pipeline will supply a curated list of new/changed restaurants instead.
  let query = supabaseServer
    .from("restaurants")
    .select("id, name, slug, neighborhood, score, dossier")
    .not("score", "is", null)
    .gte("score", 75)
    .order("score", { ascending: false })
    .limit(5);

  if (follow_type === "neighborhood") {
    query = query.eq("neighborhood", follow_target);
  } else {
    query = query.eq("city", "New York");
  }

  const { data: restaurants } = await query;

  if (!restaurants?.length) {
    return NextResponse.json({ error: "No restaurants found for this target." }, { status: 404 });
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";
  // Test unsubscribe URL — the handler gracefully no-ops on an unknown token
  const unsubscribeUrl = `${SITE_URL}/api/follows/unsubscribe?token=test-preview`;

  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: user.email!,
    subject: `[TEST DIGEST] ${follow_target}`,
    html: buildDigestEmail({
      follow_target,
      follow_type,
      restaurants: restaurants as DigestRestaurant[],
      unsubscribeUrl,
    }),
  });

  if (emailError) {
    console.error("[send-test-digest] resend error:", emailError);
    return NextResponse.json({ error: "Could not send test email." }, { status: 500 });
  }

  return NextResponse.json({ status: "sent" });
}
