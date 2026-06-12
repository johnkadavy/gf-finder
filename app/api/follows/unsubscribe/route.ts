import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase-admin";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    redirect("/follows/unsubscribed?status=invalid");
  }

  // Always redirect to success even if token is unknown — avoids confirming existence of a follow
  await supabaseServer
    .from("follows")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("confirmation_token", token)
    .is("unsubscribed_at", null);

  redirect("/follows/unsubscribed?status=ok");
}
