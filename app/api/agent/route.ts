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
  let history: Anthropic.MessageParam[];
  try {
    const body = await request.json();
    query = (body.query ?? "").trim();
    // Accept up to 20 prior turns for context; older history is dropped to control token cost
    const raw = Array.isArray(body.history) ? body.history : [];
    history = raw.slice(-20).map((m: { role: string; content: string }) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: String(m.content ?? ""),
    }));
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

  // Pre-build response headers. For anonymous users, set the cookie upfront so it's
  // included on the streaming response (we only reach this point if the query is allowed).
  const responseHeaders = new Headers({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
  });
  if (usageCtx.type === "anon") {
    responseHeaders.append(
      "Set-Cookie",
      `${ANON_COOKIE}=${usageCtx.count + 1}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`,
    );
  }

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: query },
  ];

  const referencedRestaurants: Array<{ id: number; name: string }> = [];

  function trackRestaurants(toolName: string, result: unknown) {
    if (toolName === "search_restaurants") {
      const r = result as { results?: Array<{ id: number; name: string }> };
      r.results?.forEach(({ id, name }) => {
        if (!referencedRestaurants.find((x) => x.id === id)) referencedRestaurants.push({ id, name });
      });
    } else if (toolName === "get_restaurant_details") {
      const r = result as { restaurant?: { id: number; name: string } | null };
      if (r.restaurant && !referencedRestaurants.find((x) => x.id === r.restaurant!.id)) {
        referencedRestaurants.push({ id: r.restaurant.id, name: r.restaurant.name });
      }
    }
  }

  const encoder = new TextEncoder();

  const body = new ReadableStream({
    async start(controller) {
      function send(data: object) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      }

      let rounds = 0;

      try {
        while (rounds < MAX_TOOL_ROUNDS) {
          const stream = anthropic.messages.stream({
            model: "claude-sonnet-4-6",
            max_tokens: 1024,
            system: SYSTEM_PROMPT,
            tools: TOOLS,
            messages,
          });

          // Forward text tokens to client in real-time.
          // During tool-use rounds Claude emits no text, so this only fires on the final response.
          stream.on("text", (text) => send({ type: "delta", text }));

          const message = await stream.finalMessage();

          if (message.stop_reason === "end_turn") {
            // Increment DB usage for logged-in users (cookie already set in response headers)
            if (usageCtx.type === "user") {
              const serverClient = await createClient();
              await serverClient
                .from("profiles")
                .update({ agent_queries_used: usageCtx.count + 1 })
                .eq("id", usageCtx.userId);
            }

            const newCount = isUnlimited ? null : queriesUsed + 1;
            const queriesRemaining = isUnlimited ? null : FREE_LIMIT - (newCount ?? 0);

            send({
              type: "done",
              referenced_restaurants: referencedRestaurants,
              queries_remaining: queriesRemaining,
            });
            controller.close();
            return;
          }

          if (message.stop_reason === "tool_use") {
            messages.push({ role: "assistant", content: message.content });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of message.content) {
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
                trackRestaurants(block.name, result);
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

        send({ type: "error", message: "Agent did not produce a response" });
        controller.close();
      } catch (err) {
        console.error("[/api/agent] Error:", err);
        send({ type: "error", message: "Failed to get response from agent" });
        controller.close();
      }
    },
  });

  return new Response(body, { headers: responseHeaders });
}
