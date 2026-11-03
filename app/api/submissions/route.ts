import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-admin";
import { PROTOCOL_SCHEMA_VERSION, resolveInvite } from "@/lib/invites";
import { hiddenField, parseProtocolAnswers, verifyTallySignature, type TallyFile, type TallyPayload } from "@/lib/tally";
import { notifyAdminOfSubmission } from "@/lib/email/submission-notify";

const UPLOAD_BUCKET = "restaurant-uploads";
const MAX_FILE_BYTES = 15 * 1024 * 1024;

/**
 * Tally webhook for restaurant submissions (PRIORITIES.md item A).
 *
 * Trust chain: Tally's signature proves the request came from our form; the
 * `token` hidden field proves the respondent holds an invite we sent. The
 * restaurant is always taken from the invite — never from the form's other
 * hidden fields, which anyone holding the link can edit.
 *
 * Everything is stored as `pending`; nothing touches a listing or the score
 * until an admin approves it. A response on an expired or revoked invite is
 * kept as `rejected` (and still emailed) so we can follow up with a fresh
 * link. Missing or unknown tokens are acknowledged with 200 (so Tally doesn't
 * retry) and dropped.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TALLY_SIGNING_SECRET;
  if (!secret) {
    console.error("[submissions] TALLY_SIGNING_SECRET not set");
    return NextResponse.json({ error: "Not configured." }, { status: 500 });
  }

  const rawBody = await req.text();
  if (!verifyTallySignature(rawBody, req.headers.get("tally-signature"), secret)) {
    return NextResponse.json({ error: "Invalid signature." }, { status: 401 });
  }

  let payload: TallyPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }
  if (payload.eventType !== "FORM_RESPONSE" || !payload.data?.fields) {
    return NextResponse.json({ ignored: "event type" });
  }

  const { data } = payload;
  const form =
    data.formId === process.env.TALLY_PROTOCOL_FORM_ID ? "protocol"
    : data.formId === process.env.TALLY_INTEREST_FORM_ID ? "verified_interest"
    : null;
  if (!form) {
    console.warn(`[submissions] unknown form ${data.formId}`);
    return NextResponse.json({ ignored: "unknown form" });
  }

  const token = hiddenField(data.fields, "token");
  const state = token ? await resolveInvite(supabaseServer, token) : { status: "unknown" as const };
  if (state.status === "unknown") {
    console.warn(`[submissions] ${data.responseId}: no valid invite token; dropped`);
    return NextResponse.json({ ignored: "invite unknown" });
  }
  const { invite } = state;
  const inviteActive = state.status === "valid";
  const restaurantId = invite.restaurant.id;
  const restaurantName = invite.restaurant.display_name ?? invite.restaurant.name;

  // Idempotency: Tally retries deliver the same responseId.
  const { data: existing } = await supabaseServer
    .from("restaurant_submissions")
    .select("id")
    .eq("external_id", data.responseId)
    .maybeSingle();
  if (existing) return NextResponse.json({ success: true, duplicate: true });

  const notes: string[] = [];
  if (!inviteActive) notes.push(`Invite ${state.status} — answers kept as rejected; send a fresh link to follow up.`);
  let answers: Record<string, unknown>;
  let menuFiles: TallyFile[] = [];

  if (form === "protocol") {
    const parsed = parseProtocolAnswers(data.fields);
    menuFiles = parsed.menu.menu_files;
    answers = parsed;
    if (!parsed.attest.accurate || !parsed.attest.publish) notes.push("Sign-off incomplete — missing one or both attestations.");
    if (Object.keys(parsed.unmapped).length) notes.push(`Unmapped options: ${JSON.stringify(parsed.unmapped)}`);
    const formRestaurantId = hiddenField(data.fields, "restaurant_id");
    if (formRestaurantId && formRestaurantId !== String(restaurantId)) {
      notes.push(`Form restaurant_id (${formRestaurantId}) didn't match the invite — invite wins.`);
    }
  } else {
    // Interest form: small and display-only, so keep the label → value pairs.
    answers = Object.fromEntries(
      data.fields
        .filter((f) => f.type !== "HIDDEN_FIELDS")
        .map((f) => {
          const byId = new Map((f.options ?? []).map((o) => [o.id, o.text]));
          const value = Array.isArray(f.value) ? f.value.map((v) => (typeof v === "string" ? byId.get(v) ?? v : v)) : f.value;
          return [f.label, value];
        })
    );
  }

  const { data: restaurantRow } = await supabaseServer
    .from("restaurants")
    .select("score")
    .eq("id", restaurantId)
    .single();

  const { data: submission, error: insertErr } = await supabaseServer
    .from("restaurant_submissions")
    .insert({
      restaurant_id: restaurantId,
      invite_id: invite.id,
      form,
      external_id: data.responseId,
      schema_version: Number(hiddenField(data.fields, "schema_version")) || PROTOCOL_SCHEMA_VERSION,
      answers,
      raw_payload: payload,
      status: inviteActive ? "pending" : "rejected",
      review_note: notes.length ? notes.join("\n") : null,
      score_before: restaurantRow?.score ?? null,
      submitted_at: data.createdAt,
    })
    .select("id")
    .single();

  if (insertErr) {
    // Lost a race with a concurrent retry of the same response.
    if (insertErr.code === "23505") return NextResponse.json({ success: true, duplicate: true });
    console.error(`[submissions] insert failed for ${data.responseId}:`, insertErr.message);
    return NextResponse.json({ error: "Insert failed." }, { status: 500 });
  }

  if (form === "protocol" && inviteActive) {
    // A newer protocol submission replaces any still-pending older ones.
    await supabaseServer
      .from("restaurant_submissions")
      .update({ status: "superseded" })
      .eq("restaurant_id", restaurantId)
      .eq("form", "protocol")
      .eq("status", "pending")
      .neq("id", submission.id);

    const notesBefore = notes.length;
    for (const file of menuFiles) {
      const note = await archiveMenuFile(restaurantId, submission.id, file);
      if (note) notes.push(note);
    }

    // A menu link is recorded for the Phase 1 fetcher; we don't fetch it here.
    const menuLink = (answers as ReturnType<typeof parseProtocolAnswers>).menu.menu_link;
    if (menuLink) {
      const { error } = await supabaseServer.from("menu_sources").insert({
        restaurant_id: restaurantId,
        submission_id: submission.id,
        source_type: "restaurant_upload",
        url: menuLink,
      });
      if (error) notes.push(`Menu link not recorded: ${error.message}`);
    }

    if (notes.length > notesBefore) {
      await supabaseServer.from("restaurant_submissions").update({ review_note: notes.join("\n") }).eq("id", submission.id);
    }
  }

  await supabaseServer
    .from("restaurant_invites")
    .update({ first_used_at: new Date().toISOString() })
    .eq("id", invite.id)
    .is("first_used_at", null);

  const contact = form === "protocol" ? (answers as ReturnType<typeof parseProtocolAnswers>).contact : null;
  try {
    await notifyAdminOfSubmission({
      submissionId: submission.id,
      restaurantName,
      restaurantId,
      form: inviteActive ? form : `${form} (invite ${state.status} — stored as rejected)`,
      contact: contact ? [contact.name, contact.role, contact.email].filter(Boolean).join(" · ") || "(no contact)" : "—",
      notes,
    });
  } catch (e) {
    console.error("[submissions] notify failed:", e);
  }

  return NextResponse.json({ success: true });
}

/**
 * Copy an uploaded menu from Tally into our private bucket and record it as a
 * `restaurant_upload` menu source. Returns a note on failure; never throws.
 */
async function archiveMenuFile(restaurantId: number, submissionId: string, file: TallyFile): Promise<string | null> {
  try {
    const res = await fetch(file.url);
    if (!res.ok) return `Menu file "${file.name}" download failed (${res.status}).`;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length > MAX_FILE_BYTES) return `Menu file "${file.name}" is over 15 MB; not stored.`;

    const contentType = file.mimeType ?? res.headers.get("content-type") ?? "application/octet-stream";
    const safeName = file.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-100);
    const storagePath = `${restaurantId}/${submissionId}/${safeName}`;

    const { error: upErr } = await supabaseServer.storage
      .from(UPLOAD_BUCKET)
      .upload(storagePath, bytes, { contentType, upsert: true });
    if (upErr) return `Menu file "${file.name}" upload failed: ${upErr.message}`;

    const { error: rowErr } = await supabaseServer.from("menu_sources").insert({
      restaurant_id: restaurantId,
      submission_id: submissionId,
      source_type: "restaurant_upload",
      storage_path: storagePath,
      content_type: contentType,
      content_hash: createHash("sha256").update(bytes).digest("hex"),
      fetched_at: new Date().toISOString(),
    });
    return rowErr ? `Menu file "${file.name}" stored but not recorded: ${rowErr.message}` : null;
  } catch (e) {
    return `Menu file "${file.name}" failed: ${String(e)}`;
  }
}
