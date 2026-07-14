import { createClient } from "@/lib/supabase-server";

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response(null, { status: 401 });

  // Skip if already stamped within the last 30 minutes — cheap multi-tab guard.
  const { data: profile } = await supabase
    .from("profiles")
    .select("last_active_at")
    .eq("user_id", user.id)
    .single();

  const lastActive = profile?.last_active_at ? new Date(profile.last_active_at) : null;
  if (lastActive && Date.now() - lastActive.getTime() < 30 * 60 * 1000) {
    return new Response(null, { status: 204 });
  }

  await supabase
    .from("profiles")
    .update({ last_active_at: new Date().toISOString(), email: user.email })
    .eq("user_id", user.id);

  return new Response(null, { status: 204 });
}
