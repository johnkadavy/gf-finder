import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const AUTH_TIMEOUT_MS = 1500;

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must be called on every request. If Supabase Auth is
  // slow or errors, fail open rather than 504 every page; /account does its
  // own getUser() check and redirect, so skipping the gate here is safe.
  let user: Awaited<ReturnType<typeof supabase.auth.getUser>>["data"]["user"] = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      supabase.auth.getUser(),
      new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), AUTH_TIMEOUT_MS);
      }),
    ]);
    if (result === "timeout") {
      console.warn("[middleware] auth.getUser timed out, failing open", request.nextUrl.pathname);
      return supabaseResponse;
    }
    user = result.data.user;
  } catch (err) {
    console.warn("[middleware] auth.getUser failed, failing open", request.nextUrl.pathname, err);
    return supabaseResponse;
  } finally {
    clearTimeout(timer);
  }

  // Gate /account behind auth (/map now has its own preview gate)
  if (!user && request.nextUrl.pathname.startsWith("/account")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", "/account");
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
