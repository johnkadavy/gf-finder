import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { supabaseServer } from "@/lib/supabase-server";
import { DossierSchema } from "@/lib/dossier-schema";

const client = new Anthropic();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { restaurantName, city, neighborhood } = body;

    if (!restaurantName || !city || !neighborhood) {
      return NextResponse.json(
        { error: "restaurantName, city, and neighborhood are required" },
        { status: 400 }
      );
    }

    const slug = [restaurantName, city, neighborhood]
      .join("-")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "");

    const response = await client.messages.parse({
      model: "claude-opus-4-6",
      max_tokens: 16000,
      system: `You are a gluten-free dining expert. Your job is to generate a structured dossier about a restaurant's gluten-free experience based on everything you know about it.

Be honest about uncertainty. If you don't know something, use "unknown" or conservative values. Never fabricate sick reports — only include them if you have real knowledge of them. Set confidence to "low" if you have limited knowledge of this specific restaurant.

Today's date is ${new Date().toISOString().split("T")[0]}.`,
      messages: [
        {
          role: "user",
          content: `Generate a gluten-free dossier for: ${restaurantName}, located in ${neighborhood}, ${city}.`,
        },
      ],
      output_config: {
        format: zodOutputFormat(DossierSchema, "dossier"),
      },
    });

    const dossier = response.parsed_output;

    if (!dossier) {
      return NextResponse.json(
        { error: "Failed to parse dossier from AI response" },
        { status: 500 }
      );
    }

    const { error } = await supabaseServer
      .from("restaurants")
      .upsert(
        { name: restaurantName, city, neighborhood, slug, dossier },
        { onConflict: "name,city,neighborhood" }
      );

    if (error) {
      console.error(error);
      return NextResponse.json(
        { error: "Failed to save dossier" },
        { status: 500 }
      );
    }

    return NextResponse.json({ dossier });
  } catch (error) {
    console.error(error);

    return NextResponse.json(
      { error: "Failed to generate dossier" },
      { status: 500 }
    );
  }
}
