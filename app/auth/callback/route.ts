import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-admin";

/**
 * Auto-enroll verified sign-ins into the email digest (disclosed on the login
 * form). Magic-link verification proves email ownership, so no separate
 * double opt-in is needed. Idempotent; never re-subscribes anyone who has
 * unsubscribed.
 *
 * IMPORTANT: writes to the follows table directly (already confirmed) and must
 * NEVER go through POST /api/follows — that route sends a confirmation email,
 * which would mean two emails on signup (magic link + confirm).
 */
async function autoEnrollDigest(email: string): Promise<void> {
  const { data: rows, error } = await supabaseServer
    .from("follows")
    .select("id, follow_target, confirmed_at, unsubscribed_at")
    .eq("email", email);
  if (error) throw error;

  // Respect any prior opt-out — do not resubscribe.
  if (rows?.some((r) => r.unsubscribed_at)) return;
  // Already an active subscriber — nothing to do.
  if (rows?.some((r) => r.confirmed_at)) return;

  const pending = rows?.filter((r) => !r.confirmed_at) ?? [];
  if (pending.length > 0) {
    // They started a follow but never clicked the confirm email; the magic
    // link just proved ownership, so confirm those follows now.
    await supabaseServer
      .from("follows")
      .update({ confirmed_at: new Date().toISOString() })
      .in("id", pending.map((r) => r.id));
    return;
  }

  await supabaseServer.from("follows").upsert(
    {
      email,
      follow_type: "region",
      follow_target: "New York City",
      source_page: "signup-auto",
      cadence: "weekly",
      confirmation_token: crypto.randomUUID(),
      confirmed_at: new Date().toISOString(),
      unsubscribed_at: null,
    },
    { onConflict: "email,follow_target" }
  );
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") ?? "/map";

  if (code || (token_hash && type)) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = code
      ? await supabase.auth.exchangeCodeForSession(code)
      : await supabase.auth.verifyOtp({ token_hash: token_hash!, type: type! });

    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user?.email) {
        try {
          await autoEnrollDigest(user.email);
        } catch (err) {
          // Never block login on enrollment problems.
          console.error("[auth-callback] digest auto-enroll failed:", err);
        }
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
