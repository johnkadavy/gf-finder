import { NextResponse } from "next/server";
import { Resend } from "resend";
import Anthropic from "@anthropic-ai/sdk";
import { supabaseServer } from "@/lib/supabase-admin";
import { buildDigestEmail } from "@/lib/email/digest";
import type { DigestRestaurant } from "@/lib/email/digest";
import { TOPIC_POOL } from "@/lib/digest-topics";
import type { Topic } from "@/lib/digest-topics";

// TODO (revisit when follower count reaches a few hundred):
// - Concurrency guard: short-TTL lock row in a `cron_locks` table checked at job start.
// - Resend idempotency key per subscriber+run to prevent duplicate sends on retry.
// - Batching/queue (Inngest or Vercel queue) if follows grow past ~600.

const resend = new Resend(process.env.RESEND_API_KEY);
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const FROM_EMAIL = "CleanPlate <noreply@auth.trycleanplate.com>";
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "https://trycleanplate.com";
const AIRTABLE_BASE_ID = process.env.AIRTABLE_BASE_ID;
const AIRTABLE_API_KEY = process.env.AIRTABLE_API_KEY;
const DIGEST_MIN_SCORE = 80;

export async function GET(req: Request) {
  if (req.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  // 1. Select today's topic based on what was recently sent
  const topic = await selectTopic();
  console.log("[weekly-digest] selected topic:", topic.label);

  // 2. Fetch matching restaurants
  const { restaurants, totalCount } = await fetchRestaurants(topic);
  if (!restaurants.length) {
    console.error("[weekly-digest] no restaurants found for topic:", topic.label);
    return NextResponse.json({ error: "No restaurants found for topic." }, { status: 500 });
  }

  // 3. Generate subject line + intro copy via Claude Haiku
  const { subject, intro } = await generateCopy(topic, restaurants);

  // 4. Get active subscribers, deduplicated by email
  const { data: allFollows, error: followsError } = await supabaseServer
    .from("follows")
    .select("email, confirmation_token, cadence")
    .not("confirmed_at", "is", null)
    .is("unsubscribed_at", null);

  if (followsError) {
    console.error("[weekly-digest] failed to load follows:", followsError);
    return NextResponse.json({ error: "Failed to load follows." }, { status: 500 });
  }

  // Deduplicate by email — if someone has both a weekly and daily follow, prefer daily
  const emailMap = new Map<string, { confirmation_token: string; cadence: string | null }>();
  for (const row of (allFollows ?? [])) {
    const existing = emailMap.get(row.email);
    if (!existing || row.cadence === "daily") {
      emailMap.set(row.email, { confirmation_token: row.confirmation_token, cadence: row.cadence });
    }
  }

  const isMonday = new Date().getDay() === 1;
  const results = { sent: 0, skipped: 0, errors: 0 };

  // 5. Send to each subscriber
  for (const [email, { confirmation_token, cadence }] of emailMap) {
    if ((cadence ?? "weekly") === "weekly" && !isMonday) {
      results.skipped++;
      continue;
    }

    const unsubscribeUrl = `${SITE_URL}/api/follows/unsubscribe?token=${confirmation_token}`;
    const html = buildDigestEmail({
      label: topic.label,
      restaurants,
      unsubscribeUrl,
      rankingsUrl: topic.rankingsUrl,
      totalCount,
      introCopy: intro,
    });

    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      subject,
      html,
    });

    if (error) {
      console.error("[weekly-digest] resend error for", email, error);
      results.errors++;
    } else {
      results.sent++;
    }
  }

  // 6. Log to Airtable as Sent (non-blocking — failure doesn't abort the run)
  if (results.sent > 0 || results.errors === 0) {
    logToAirtable(topic, subject, intro, results.sent).catch((err) => {
      console.error("[weekly-digest] airtable log failed:", err);
    });
  }

  console.log("[weekly-digest] done", { topic: topic.label, ...results });
  return NextResponse.json({ topic: topic.label, ...results });
}

async function selectTopic(): Promise<Topic> {
  let recentLabels: string[] = [];

  try {
    const url = new URL(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Email%20Digests`);
    url.searchParams.set("filterByFormula", "{Status}='Sent'");
    url.searchParams.set("maxRecords", "10");
    url.searchParams.set("fields[]", "Display label");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${AIRTABLE_API_KEY}` },
    });

    if (res.ok) {
      const data = await res.json() as { records: { createdTime: string; fields: Record<string, string> }[] };
      // Sort by createdTime descending, take last 3
      const sorted = (data.records ?? [])
        .sort((a, b) => new Date(b.createdTime).getTime() - new Date(a.createdTime).getTime())
        .slice(0, 3);
      recentLabels = sorted.map((r) => r.fields["Display label"]).filter(Boolean);
    }
  } catch (err) {
    console.warn("[weekly-digest] could not fetch recent Airtable topics, picking randomly:", err);
  }

  const recentSet = new Set(recentLabels);
  const mostRecentType = recentLabels.length > 0
    ? TOPIC_POOL.find((t) => t.label === recentLabels[0])?.type
    : null;

  const notRecent = TOPIC_POOL.filter((t) => !recentSet.has(t.label));
  const pool = notRecent.length > 0 ? notRecent : TOPIC_POOL;
  const differentType = pool.filter((t) => t.type !== mostRecentType);
  const candidates = differentType.length > 0 ? differentType : pool;

  return candidates[Math.floor(Math.random() * candidates.length)];
}

async function fetchRestaurants(topic: Topic): Promise<{ restaurants: DigestRestaurant[]; totalCount: number }> {
  let query = supabaseServer
    .from("restaurants")
    .select("id, name, slug, neighborhood, score, dossier")
    .eq("city", "New York")
    .not("score", "is", null)
    .gte("score", DIGEST_MIN_SCORE)
    .order("score", { ascending: false });

  switch (topic.type) {
    case "neighborhood":
      query = query.eq("neighborhood", topic.target);
      break;
    case "cuisine":
      query = query.ilike("cuisine", `%${topic.target}%`);
      break;
    case "place_type":
      query = query.contains("place_type", [topic.target]);
      break;
  }

  const { data } = await query;
  const all = (data ?? []) as DigestRestaurant[];

  // Feature 3–5 based on pool depth; lead with strongest picks
  const featureCount = all.length >= 8 ? 5 : all.length >= 5 ? 4 : Math.min(3, all.length);
  return { restaurants: all.slice(0, featureCount), totalCount: all.length };
}

async function generateCopy(
  topic: Topic,
  restaurants: DigestRestaurant[]
): Promise<{ subject: string; intro: string }> {
  const list = restaurants
    .map((r) => `- ${r.name} (${r.neighborhood ?? "NYC"})`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 300,
    messages: [
      {
        role: "user",
        content: `You are writing a short email digest for a gluten-free restaurant guide covering NYC.

Topic: ${topic.label}
Featured restaurants:
${list}

Write:
1. A subject line — punchy and specific, under 60 characters
2. Intro copy — 2–3 sentences, warm and editorial, not a list

Voice rules:
- Speak as someone who knows NYC's GF scene deeply. Never mention a guide, app, database, or rankings.
- Acknowledge the real anxiety of eating out with celiac, casually not clinically.
- Strong opinions. Short punchy sentences.
- No filler phrases ("nestled in", "hidden gem", "a must-try", "look no further").
- Never use em dashes (—). Use a period or rewrite.

Reply in exactly this format (no extra text):
SUBJECT: <subject line>
INTRO: <intro copy>`,
      },
    ],
  });

  const text = (message.content[0] as { type: string; text: string }).text ?? "";
  const subjectMatch = text.match(/^SUBJECT:\s*(.+)$/m);
  const introMatch = text.match(/^INTRO:\s*([\s\S]+)$/m);

  return {
    subject: subjectMatch?.[1]?.trim() ?? `Today's best GF spots in NYC`,
    intro: introMatch?.[1]?.trim() ?? "",
  };
}

async function logToAirtable(
  topic: Topic,
  subject: string,
  intro: string,
  sentCount: number
): Promise<void> {
  if (!AIRTABLE_BASE_ID || !AIRTABLE_API_KEY) return;

  await fetch(`https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/Email%20Digests`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${AIRTABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        "Topic Type": topic.type,
        "Topic Target": topic.target,
        "Display label": topic.label,
        "Status": "Sent",
        "Subject Line": subject,
        "Intro Copy": intro,
        "Rankings URL": topic.rankingsUrl,
        "Name": `${new Date().toISOString().slice(0, 10)} — ${topic.label} (${sentCount} sent)`,
      },
    }),
  });
}
