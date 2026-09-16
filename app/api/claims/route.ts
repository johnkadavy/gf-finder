import { NextRequest, NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

/**
 * Public claim submission. Restaurant owners aren't logged in, so this route
 * takes no auth — it validates lightly, drops obvious bots via a honeypot, and
 * inserts a pending row with the service-role client (bypasses RLS).
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  // Honeypot — pretend success, write nothing.
  if (str(body.company, 100) !== "") return NextResponse.json({ success: true });

  const name = str(body.name, 120);
  const email = str(body.email, 200);
  const role = str(body.role, 120) || null;
  const message = str(body.message, 2000) || null;
  const restaurant_id = typeof body.restaurant_id === "number" ? body.restaurant_id : null;
  const google_place_id = typeof body.google_place_id === "string" ? body.google_place_id : null;

  if (!name || !EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Please add your name and a valid email." }, { status: 400 });
  }
  if (restaurant_id === null && google_place_id === null) {
    return NextResponse.json({ error: "Missing restaurant reference." }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("restaurant_claims").insert({
    restaurant_id,
    google_place_id,
    name,
    email,
    role,
    message,
    status: "pending",
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
