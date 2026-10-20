import { Resend } from "resend";
import type { User } from "@supabase/supabase-js";

const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";

// A user counts as a new signup when their email was first confirmed within
// this window — i.e. this callback is the one that verified them. Magic links
// stay valid for an hour, so created_at (set when the link is requested) would
// miss slow clickers; email_confirmed_at is set on first verification.
const NEW_SIGNUP_WINDOW_MS = 10 * 60 * 1000;

export function isNewSignup(user: User): boolean {
  if (!user.email_confirmed_at) return false;
  return Date.now() - new Date(user.email_confirmed_at).getTime() < NEW_SIGNUP_WINDOW_MS;
}

/**
 * Email the admin (ADMIN_NOTIFY_EMAIL) about a newly verified user.
 *
 * Deduped with a Resend idempotency key per user ID, so re-clicking the link or
 * logging in again inside the signup window never sends a second notification.
 * Callers must not let failures block login — this throws on send errors.
 */
export async function notifyAdminOfNewUser(user: User, next: string): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) {
    console.warn("[new-user-notify] ADMIN_NOTIFY_EMAIL not set; skipping");
    return;
  }

  const lines = [
    "New CleanPlate signup",
    "",
    `Email:       ${user.email ?? "(none)"}`,
    `User ID:     ${user.id}`,
    `Created:     ${user.created_at}`,
    `Verified:    ${user.email_confirmed_at}`,
    `Provider:    ${user.app_metadata?.provider ?? "unknown"}`,
    `Landed on:   ${next}`,
  ];

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    {
      from: FROM_EMAIL,
      to,
      subject: `New CleanPlate signup: ${user.email ?? user.id}`,
      text: lines.join("\n"),
    },
    { idempotencyKey: `new-user-signup/${user.id}` }
  );
  if (error) throw new Error(`Resend error: ${error.message}`);
}
