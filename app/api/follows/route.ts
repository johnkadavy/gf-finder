import { NextResponse } from "next/server";
import { Resend } from "resend";
import { supabaseServer } from "@/lib/supabase-admin";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";

const VALID_FOLLOW_TYPES = ["neighborhood", "category", "region"] as const;
type FollowType = (typeof VALID_FOLLOW_TYPES)[number];

function escapeHtml(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { email, follow_type, follow_target, source_page } = body as {
    email?: string;
    follow_type?: string;
    follow_target?: string;
    source_page?: string;
  };

  // Validate inputs
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Invalid email address." }, { status: 400 });
  }
  if (!VALID_FOLLOW_TYPES.includes(follow_type as FollowType)) {
    return NextResponse.json({ error: "Invalid follow type." }, { status: 400 });
  }
  if (!follow_target?.trim()) {
    return NextResponse.json({ error: "Follow target is required." }, { status: 400 });
  }

  // If already confirmed and active, return silently — no duplicate send
  const { data: existing } = await supabaseServer
    .from("follows")
    .select("confirmed_at, unsubscribed_at")
    .eq("email", email)
    .eq("follow_target", follow_target)
    .maybeSingle();

  if (existing?.confirmed_at && !existing?.unsubscribed_at) {
    return NextResponse.json({ status: "already_following" });
  }

  // Upsert — fresh token each time (invalidates prior confirmation links)
  const newToken = crypto.randomUUID();
  const { data: follow, error: upsertError } = await supabaseServer
    .from("follows")
    .upsert(
      {
        email,
        follow_type,
        follow_target: follow_target.trim(),
        source_page: source_page ?? null,
        confirmation_token: newToken,
        confirmed_at: null,
        unsubscribed_at: null,
      },
      { onConflict: "email,follow_target" }
    )
    .select("confirmation_token")
    .single();

  if (upsertError || !follow) {
    console.error("[follows] upsert error:", upsertError);
    return NextResponse.json({ error: "Could not save your follow. Please try again." }, { status: 500 });
  }

  // Send confirmation email
  const confirmUrl = `${SITE_URL}/api/follows/confirm?token=${follow.confirmation_token}`;
  const { error: emailError } = await resend.emails.send({
    from: FROM_EMAIL,
    to: email,
    subject: "Confirm your CleanPlate follow",
    html: buildConfirmEmail({ follow_target: follow_target.trim(), follow_type: follow_type!, confirmUrl }),
  });

  if (emailError) {
    console.error("[follows] resend error:", emailError);
    return NextResponse.json({ error: "Could not send confirmation email. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ status: "pending_confirmation" });
}

function buildConfirmEmail({
  follow_target,
  follow_type,
  confirmUrl,
}: {
  follow_target: string;
  follow_type: string;
  confirmUrl: string;
}) {
  const label =
    follow_type === "neighborhood"
      ? `the ${escapeHtml(follow_target)} neighborhood`
      : escapeHtml(follow_target);

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f0f0f0;font-family:'Courier New',Courier,monospace;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background:#f0f0f0;padding:40px 20px;">
    <tr><td align="center">
      <table width="540" cellpadding="0" cellspacing="0" role="presentation" style="background:#ffffff;border:1px solid #d8d8d8;max-width:540px;width:100%;">

        <!-- Header -->
        <tr>
          <td style="padding:28px 36px 24px;border-bottom:2px solid #111111;">
            <p style="margin:0;font-size:16px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#111111;">CleanPlate</p>
            <p style="margin:4px 0 0;font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#888888;">GF Restaurant Safety Ratings</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px 28px;">
            <p style="margin:0 0 8px;font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:#888888;">Confirm your follow</p>
            <p style="margin:0 0 20px;font-size:15px;line-height:1.7;color:#222222;font-family:Georgia,serif;">
              You asked to follow ${label}. Confirm below and we&rsquo;ll email you when a new high-scoring GF spot is added.
            </p>
            <a href="${confirmUrl}"
               style="display:inline-block;padding:14px 28px;background:#FF7444;color:#ffffff;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;text-decoration:none;font-family:'Courier New',Courier,monospace;">
              Confirm Follow &rarr;
            </a>
            <p style="margin:28px 0 0;font-size:11px;line-height:1.7;color:#999999;">
              If you didn&rsquo;t request this, ignore this email &mdash; nothing will happen.<br>
              Or paste this link: <span style="color:#555555;word-break:break-all;">${escapeHtml(confirmUrl)}</span>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 36px;border-top:1px solid #e8e8e8;">
            <p style="margin:0;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:#bbbbbb;">
              &copy; CleanPlate &mdash; <a href="${SITE_URL}" style="color:#bbbbbb;">trycleanplate.com</a>
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}
