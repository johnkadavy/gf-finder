import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@/lib/supabase-server";
import { supabaseServer } from "@/lib/supabase-admin";
import { buildDigestEmail } from "@/lib/email/digest";
import type { DigestRestaurant } from "@/lib/email/digest";
import { TOPIC_POOL } from "@/lib/digest-topics";

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

  // Top 3 NYC restaurants — sufficient for styling preview
  const { data: restaurants } = await supabaseServer
    .from("restaurants")
    .select("id, name, slug, neighborhood, cuisine, score, dossier")
    .eq("city", "New York")
    .not("score", "is", null)
    .gte("score", 80)
    .order("score", { ascending: false })
    .limit(3);

  if (!restaurants?.length) {
    return NextResponse.json({ error: "No restaurants found." }, { status: 404 });
  }

  const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";
  const unsubscribeUrl = `${SITE_URL}/api/follows/unsubscribe?token=test-preview`;

  // Random topic so tests exercise the hero image + CTA layout
  const topic = TOPIC_POOL[Math.floor(Math.random() * TOPIC_POOL.length)];

  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: user.email!,
    subject: `[TEST DIGEST] ${topic.label}`,
    html: buildDigestEmail({
      label: topic.label,
      restaurants: restaurants as DigestRestaurant[],
      unsubscribeUrl,
      rankingsUrl: topic.rankingsUrl,
      heroImageUrl: topic.heroImage,
    }),
  });

  if (emailError) {
    console.error("[send-test-digest] resend error:", emailError);
    return NextResponse.json({ error: "Could not send test email." }, { status: 500 });
  }

  return NextResponse.json({ status: "sent" });
}
