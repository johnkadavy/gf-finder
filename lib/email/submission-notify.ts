import { Resend } from "resend";

const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";

/**
 * Email the admin (ADMIN_NOTIFY_EMAIL) that a restaurant submission is waiting
 * for review. Deduped per submission via a Resend idempotency key, so Tally
 * webhook retries never send twice. Throws on send errors — callers must not
 * let that fail the webhook.
 */
export async function notifyAdminOfSubmission(s: {
  submissionId: string;
  restaurantName: string;
  restaurantId: number;
  form: string;
  contact: string;
  notes: string[];
}): Promise<void> {
  const to = process.env.ADMIN_NOTIFY_EMAIL;
  if (!to) {
    console.warn("[submission-notify] ADMIN_NOTIFY_EMAIL not set; skipping");
    return;
  }

  const lines = [
    "New restaurant submission — pending review",
    "",
    `Restaurant:  ${s.restaurantName} (id ${s.restaurantId})`,
    `Form:        ${s.form}`,
    `From:        ${s.contact}`,
    `Submission:  ${s.submissionId}`,
    ...(s.notes.length ? ["", "Notes:", ...s.notes.map((n) => `  • ${n}`)] : []),
  ];

  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send(
    {
      from: FROM_EMAIL,
      to,
      subject: `Restaurant submission: ${s.restaurantName}`,
      text: lines.join("\n"),
    },
    { idempotencyKey: `restaurant-submission/${s.submissionId}` }
  );
  if (error) throw new Error(`Resend error: ${error.message}`);
}
