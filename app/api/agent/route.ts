import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { searchRestaurants, getRestaurantDetails, getNeighborhoodOverview } from "@/lib/agent-tools";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FREE_LIMIT = 5;
const ANON_COOKIE = "cp_agent_queries";

const SYSTEM_PROMPT = `You are CleanPlate's gluten-free dining assistant. You help people with celiac disease and gluten sensitivities find safe restaurants and evaluate dining options.

IMPORTANT RULES:
1. ONLY recommend restaurants that exist in the CleanPlate database. Always use the search_restaurants or get_restaurant_details tools to find real data. NEVER make up restaurant names or details.
2. When discussing safety, reference specific signals from the database: GF score, cross-contamination risk, dedicated fryer status, staff knowledge, illness reports.
3. Always include a brief disclaimer: restaurant conditions can change — users should verify directly with the restaurant before visiting.
4. Be warm but concise. Users are often on their phone, possibly hungry and stressed. Get to the useful information quickly.
5. If you can't find what the user is looking for in the database, say so honestly. Don't hallucinate restaurants.
6. Default to New York City if no location is specified.
7. When recommending restaurants, prioritize by GF score, then by relevance to the user's specific request.
8. GF scores: 85+ = Excellent, 75–84 = Great, 65–74 = Good, 55–64 = Ask Questions, 40–54 = Limited/Inconsistent, <40 = High Risk.
9. Format restaurant recommendations clearly: lead with the name and score, then location, then the key safety signals that are relevant to the user's question.`;

const TOOLS: Anthropic.Tool[] = [
  {
    name: "search_restaurants",
    description:
      "Search for gluten-free-friendly restaurants by location, cuisine, place type, food category, and safety criteria. Use this when the user is looking for restaurant recommendations or browsing options.",
    input_schema: {
      type: "object" as const,
      properties: {
        city: { type: "string", description: "City name, e.g. 'New York'" },
        neighborhood: { type: "string", description: "Neighborhood name, e.g. 'East Village', 'Chelsea'" },
        cuisine: { type: "string", description: "Cuisine type, e.g. 'Italian', 'Mexican', 'Japanese'" },
        place_type: {
          type: "string",
          description: "Type of establishment: restaurant, cafe, bar, bakery, pizzeria, fast_casual, fine_dining, dessert_shop, deli, brunch_spot, juice_bar, food_truck",
        },
        gf_food_category: {
          type: "string",
          description: "Specific GF food available: gf_pizza, gf_pasta, gf_bread_bakery, gf_beer, gf_fried_items, gf_desserts, gf_sandwiches, gf_breakfast",
        },
        min_score: {
          type: "number",
          description: "Minimum GF safety score (0–100). Use 75+ for solid recommendations, 85+ for celiac-safe.",
        },
        has_dedicated_fryer: {
          type: "boolean",
          description: "Filter for restaurants with a dedicated gluten-free fryer",
        },
        has_gf_labels: {
          type: "boolean",
          description: "Filter for restaurants with clear GF menu labeling",
        },
        limit: { type: "number", description: "Max results to return (default 5, max 10)" },
      },
    },
  },
  {
    name: "get_restaurant_details",
    description:
      "Get full safety details for a specific restaurant by name. Use this when the user asks about a particular restaurant.",
    input_schema: {
      type: "object" as const,
      properties: {
        restaurant_name: { type: "string", description: "The name of the restaurant to look up" },
        city: { type: "string", description: "City to narrow the search if needed" },
      },
      required: ["restaurant_name"],
    },
  },
  {
    name: "get_neighborhood_overview",
    description:
      "Get an overview of gluten-free dining options in a specific neighborhood: total restaurants, average score, top-rated spots, and safety stats. Use this when the user asks about an area in general.",
    input_schema: {
      type: "object" as const,
      properties: {
        neighborhood: { type: "string", description: "Neighborhood name" },
        city: { type: "string", description: "City name" },
      },
      required: ["neighborhood", "city"],
    },
  },
];

// Max tool-use rounds per request — prevents runaway loops
const MAX_TOOL_ROUNDS = 5;

// ── Usage helpers ─────────────────────────────────────────────────────────────

type UsageContext =
  | { type: "admin" }
  | { type: "user"; userId: string; count: number }
  | { type: "anon"; count: number };

async function getUsageContext(): Promise<UsageContext> {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();

  if (user) {
    const { data: profile } = await serverClient
      .from("profiles")
      .select("agent_queries_used, is_admin")
      .eq("id", user.id)
      .single();

    if (profile?.is_admin) return { type: "admin" };

    return {
      type: "user",
      userId: user.id,
      count: profile?.agent_queries_used ?? 0,
    };
  }

  // Anonymous: read count from cookie
  const cookieStore = await cookies();
  const count = parseInt(cookieStore.get(ANON_COOKIE)?.value ?? "0", 10) || 0;
  return { type: "anon", count };
}

async function incrementUsage(ctx: UsageContext, responseHeaders: Headers): Promise<void> {
  if (ctx.type === "admin") return;

  if (ctx.type === "user") {
    const serverClient = await createClient();
    await serverClient
      .from("profiles")
      .update({ agent_queries_used: ctx.count + 1 })
      .eq("id", ctx.userId);
    return;
  }

  // Anonymous: set cookie with incremented count (1-year expiry)
  responseHeaders.append(
    "Set-Cookie",
    `${ANON_COOKIE}=${ctx.count + 1}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`,
  );
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  let query: string;
  try {
    const body = await request.json();
    query = (body.query ?? "").trim();
  } catch {
    return Response.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (!query) {
    return Response.json({ error: "Query is required" }, { status: 400 });
  }

  // Check usage limit
  const usageCtx = await getUsageContext();
  const queriesUsed = usageCtx.type === "admin" ? 0 : usageCtx.count;
  const isUnlimited = usageCtx.type === "admin";

  if (!isUnlimited && queriesUsed >= FREE_LIMIT) {
    return Response.json(
      { error: "limit_reached", queries_used: queriesUsed, limit: FREE_LIMIT },
      { status: 402 },
    );
  }

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: query },
  ];

  let rounds = 0;

  try {
    // Tool-use loop: Claude may call tools multiple times before giving a final answer
    while (rounds < MAX_TOOL_ROUNDS) {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages,
      });

      // If Claude is done (no more tool calls), extract text, increment usage, and return
      if (response.stop_reason === "end_turn") {
        const textBlock = response.content.find((b) => b.type === "text");
        const text = textBlock?.type === "text" ? textBlock.text : "";

        const responseHeaders = new Headers({ "Content-Type": "application/json" });
        await incrementUsage(usageCtx, responseHeaders);

        const newCount = isUnlimited ? null : queriesUsed + 1;
        const queriesRemaining = isUnlimited ? null : FREE_LIMIT - (newCount ?? 0);

        return new Response(
          JSON.stringify({ response: text, queries_used: newCount, queries_remaining: queriesRemaining }),
          { headers: responseHeaders },
        );
      }

      // Claude wants to call a tool — execute it and feed the result back
      if (response.stop_reason === "tool_use") {
        messages.push({ role: "assistant", content: response.content });

        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const block of response.content) {
          if (block.type !== "tool_use") continue;

          let result: unknown;
          try {
            switch (block.name) {
              case "search_restaurants":
                result = await searchRestaurants(block.input as Parameters<typeof searchRestaurants>[0]);
                break;
              case "get_restaurant_details":
                result = await getRestaurantDetails(block.input as Parameters<typeof getRestaurantDetails>[0]);
                break;
              case "get_neighborhood_overview":
                result = await getNeighborhoodOverview(block.input as Parameters<typeof getNeighborhoodOverview>[0]);
                break;
              default:
                result = { error: `Unknown tool: ${block.name}` };
            }
          } catch (err) {
            result = { error: `Tool execution failed: ${err instanceof Error ? err.message : String(err)}` };
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: JSON.stringify(result),
          });
        }

        messages.push({ role: "user", content: toolResults });
        rounds++;
        continue;
      }

      break;
    }

    return Response.json({ error: "Agent did not produce a response" }, { status: 500 });
  } catch (err) {
    console.error("[/api/agent] Error:", err);
    return Response.json({ error: "Failed to get response from agent" }, { status: 500 });
  }
}
