import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { supabaseServer } from "@/lib/supabase-admin";
import { enrollInDigest } from "@/lib/digest-enroll";
import { captureServer } from "@/lib/analytics-server";

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
          // Disclosed on the login form; magic link proves email ownership.
          await enrollInDigest(supabaseServer, user.email);
        } catch (err) {
          // Never block login on enrollment problems.
          console.error("[auth-callback] digest auto-enroll failed:", err);
        }
      }
      if (user) {
        // Treat accounts created within the last 5 minutes as new signups.
        const isNewUser =
          !!user.created_at &&
          Date.now() - new Date(user.created_at).getTime() < 5 * 60 * 1000;
        await captureServer(user.id, "login_completed", { is_new_user: isNewUser });
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=invalid_link`);
}
