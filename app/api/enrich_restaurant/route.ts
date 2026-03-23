import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseServer } from "@/lib/supabase-server";
import { DossierSchema } from "@/lib/dossier-schema";

export const maxDuration = 60;

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
    const { data: restaurant, error: fetchError } = await supabaseServer
      .from("restaurants")
      .select("*")
      .eq("google_place_id", google_place_id)
      .single();

    if (fetchError || !restaurant) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    // 2. Research step: use Claude with web search + fetch to gather GF info
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
        model: "claude-opus-4-6",
        max_tokens: 16000,
        tools: [
          { type: "web_search_20260209", name: "web_search" },
          { type: "web_fetch_20260209", name: "web_fetch" },
        ],
        messages,
      });

      for (const block of response.content) {
        if (block.type === "text") {
          researchText += block.text;
        }
      }

      if (response.stop_reason === "end_turn") {
        break;
      } else if (response.stop_reason === "pause_turn") {
        // Server-side tool loop hit its limit — append and continue
        messages.push({ role: "assistant", content: response.content });
      } else {
        break;
      }
    }

    // 3. Structure step: convert research into the dossier schema
    const structuredResponse = await client.messages.parse({
      model: "claude-opus-4-6",
      max_tokens: 8000,
      system: `You are a gluten-free dining expert. Convert raw restaurant research into a structured dossier.
Be conservative: if information is missing or unclear, use "unknown" rather than guessing.
Never fabricate sick reports — only include them if clearly evidenced in the research.
Today's date is ${new Date().toISOString().split("T")[0]}.`,
      messages: [
        {
          role: "user",
          content: `Convert this research into a structured GF dossier for ${restaurant.name} in ${restaurant.neighborhood}, ${restaurant.city}:

${researchText}`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DossierSchema, "dossier"),
      },
    });

    const dossier = structuredResponse.parsed_output;

    if (!dossier) {
      return NextResponse.json(
        { error: "Failed to structure dossier from research" },
        { status: 500 }
      );
    }

    // 4. Save dossier to Supabase
    const { error: updateError } = await supabaseServer
      .from("restaurants")
      .update({ dossier, enriched_at: new Date().toISOString() })
      .eq("google_place_id", google_place_id);

    if (updateError) {
      console.error(updateError);
      return NextResponse.json(
        { error: "Failed to save dossier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ dossier });
  } catch (error: unknown) {
    if (error instanceof Anthropic.APIError) {
      console.error("Anthropic API error:", error.status, error.message, JSON.stringify(error.error));
    } else {
      console.error(error);
    }
    return NextResponse.json(
      { error: "Failed to enrich restaurant" },
      { status: 500 }
    );
  }
}
