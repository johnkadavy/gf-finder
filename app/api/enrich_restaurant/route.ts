/**
 * NOTE: This route is not part of the active enrichment workflow.
 * Enrichment is currently handled in Airtable (AI fields) and synced
 * to Supabase via scripts/sync-airtable.ts.
 *
 * This route is kept as a standalone fallback: given a google_place_id,
 * it uses Claude + web search to research GF info and structure a dossier,
 * then saves it directly to Supabase. Useful if you ever want to re-enrich
 * a restaurant without going through Airtable.
 */
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseServer } from "@/lib/supabase-server";
import { DossierSchema } from "@/lib/dossier-schema";

export const maxDuration = 300;

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { google_place_id } = body;

    if (!google_place_id) {
      return NextResponse.json(
        { error: "google_place_id is required" },
        { status: 400 }
      );
    }

    // 1. Look up restaurant in Supabase
    console.log("[enrich] Looking up restaurant:", google_place_id);
    const { data: restaurant, error: fetchError } = await supabaseServer
      .from("restaurants")
      .select("*")
      .eq("google_place_id", google_place_id)
      .single();

    if (fetchError || !restaurant) {
      console.error("[enrich] Restaurant not found:", fetchError);
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }
    console.log("[enrich] Found restaurant:", restaurant.name);

    // 2. Research step
    console.log("[enrich] Starting research step...");
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: `Research the gluten-free dining experience at ${restaurant.name} in ${restaurant.neighborhood}, ${restaurant.city}.

${restaurant.website_url ? `Their website is: ${restaurant.website_url}` : "No website on file."}

Use web search and web fetch to find:
- Their menu and any gluten-free options or GF labeling
- Customer reviews mentioning gluten-free experiences (check Yelp, Google, FindMeGlutenFree)
- Any reports of people getting sick after eating there
- Staff knowledge about gluten-free needs and cross-contamination
- Whether they have dedicated equipment (fryers, prep areas)

Summarize everything you find in detail.`,
      },
    ];

    let researchText = "";

    while (true) {
      const response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 8000,
        tools: [
          { type: "web_search_20260209", name: "web_search" },
          { type: "web_fetch_20260209", name: "web_fetch" },
        ],
        messages,
      });

      console.log("[enrich] Research response stop_reason:", response.stop_reason);
      console.log("[enrich] Research content blocks:", response.content.map(b => b.type));

      for (const block of response.content) {
        if (block.type === "text") {
          researchText += block.text;
        }
      }

      if (response.stop_reason === "end_turn") {
        break;
      } else if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
      } else {
        break;
      }
    }

    console.log("[enrich] Research complete. Text length:", researchText.length);
    console.log("[enrich] Research preview:", researchText.slice(0, 200));

    if (!researchText) {
      return NextResponse.json(
        { error: "Research step returned no text" },
        { status: 500 }
      );
    }

    // 3. Structure step
    console.log("[enrich] Starting structure step...");
    const structuredResponse = await client.messages.parse({
      model: "claude-sonnet-4-6",
      max_tokens: 4000,
      system: `You are a gluten-free dining expert. Convert raw restaurant research into a structured dossier.
Be conservative: if information is missing or unclear, use "unknown" rather than guessing.
Never fabricate sick reports — only include them if clearly evidenced in the research.
Today's date is ${new Date().toISOString().split("T")[0]}.

CRITICAL SUMMARY GUIDELINES:
- Do NOT state universal truths that apply to every restaurant (e.g., "cross-contamination is always possible in a shared kitchen" — this is true everywhere and adds no value).
- Only mention cross-contamination when there is SPECIFIC evidence: either it is a documented concern at this restaurant, OR they have specific mitigation (dedicated fryer, separate prep area, strict protocols).
- Focus the summary on what is DISTINCTIVE about this restaurant's GF experience — what makes it better or worse than average.
- If the restaurant has solid GF options, lead with that. Highlight specific dishes, menu labels, or staff practices that stand out.
- Keep the summary under 3 sentences. Make every sentence count.`,
      messages: [
        {
          role: "user",
          content: `Convert this research into a structured GF dossier for ${restaurant.name} in ${restaurant.neighborhood}, ${restaurant.city}:

${researchText}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DossierSchema),
      },
    });

    console.log("[enrich] Structure step complete. parsed_output:", !!structuredResponse.parsed_output);

    const dossier = structuredResponse.parsed_output;

    if (!dossier) {
      return NextResponse.json(
        { error: "Failed to structure dossier from research" },
        { status: 500 }
      );
    }

    // 4. Save to Supabase
    console.log("[enrich] Saving dossier to Supabase...");
    const { error: updateError, count } = await supabaseServer
      .from("restaurants")
      .update({ dossier, enriched_at: new Date().toISOString() })
      .eq("google_place_id", google_place_id)
      .select();

    if (updateError) {
      console.error("[enrich] Supabase update error:", updateError);
      return NextResponse.json(
        { error: "Failed to save dossier" },
        { status: 500 }
      );
    }

    console.log("[enrich] Saved successfully. Rows affected:", count);
    return NextResponse.json({ dossier });

  } catch (error: unknown) {
    if (error instanceof Anthropic.APIError) {
      console.error("[enrich] Anthropic API error:", error.status, error.message);
    } else {
      console.error("[enrich] Unexpected error:", error);
    }
    return NextResponse.json(
      { error: "Failed to enrich restaurant" },
      { status: 500 }
    );
  }
}
