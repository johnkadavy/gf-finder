import Anthropic from "@anthropic-ai/sdk";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase-server";
import { supabaseServer } from "@/lib/supabase-admin";
import { searchRestaurants, getRestaurantDetails } from "@/lib/agent-tools";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const DEFAULT_USER_LIMIT = 5; // Default for logged-in users (overridden by profiles.agent_query_limit)
const ANON_LIMIT = 3;         // Tighter for anonymous — cookie is easily bypassed
const ANON_COOKIE = "cp_agent_queries";

// Model routing:
// - Follow-up messages (history exists) → Sonnet: context-aware reasoning matters
// - Fresh short queries (no history, ≤20 words) → Haiku: fast, sufficient for single-tool lookups
// - Fresh long queries → Sonnet
const SONNET = "claude-sonnet-4-6";
const HAIKU  = "claude-haiku-4-5-20251001";
function selectModel(query: string, hasHistory: boolean): string {
  if (hasHistory) return SONNET;
  return query.trim().split(/\s+/).length <= 20 ? HAIKU : SONNET;
}

const SYSTEM_PROMPT = `You are CleanPlate — a knowledgeable friend who's been navigating gluten-free dining in NYC for years and happens to have deep safety data on thousands of restaurants. You know which kitchens to trust, which ones to avoid, and exactly what questions to ask. You give people the straight talk they can't get from Yelp.

VOICE AND TONE:
- Warm, direct, a little irreverent. Never corporate. Never robotic.
- You acknowledge the real anxiety of eating out with celiac — not in a clinical way, but the way a friend would. ("I know the feeling — you just want to eat somewhere without playing detective.")
- Strong opinions are welcome. If a place is exceptional, say so. If the score is low, be honest about what that means.
- Short, punchy sentences. Get to the point fast — users are often hungry and on their phone.
- NEVER use filler phrases: no "Great question!", "Certainly!", "Of course!", "I'd be happy to help!", "Absolutely!", or any variation. Just answer.
- Don't over-explain. One tight disclaimer about verifying with the restaurant is enough — don't repeat it every message.

RULES:
1. ONLY recommend restaurants that exist in CleanPlate's coverage. Always use search_restaurants or get_restaurant_details to find real data. Never make up restaurant names or details.
2. When discussing safety, reference specific signals: GF score, cross-contamination risk, dedicated fryer, staff knowledge, illness reports.
3. Include a brief disclaimer once per conversation: conditions can change — always worth a quick call before visiting.
4. If you can't find what they're looking for, say so honestly. Don't hallucinate.
5. Default to New York City if no location is specified.
6. Prioritize recommendations by GF score, then relevance to the request.
7. GF scores: 85+ = Excellent, 75–84 = Great, 65–74 = Good, 55–64 = Ask Questions, 40–54 = Limited/Inconsistent, <40 = High Risk.
8. Format restaurant recommendations clearly: name and score first, then the safety signals most relevant to the question.
9. Always format restaurant names as markdown links using the url field from the tool result, e.g. [Soda Club](/restaurant/123). Every restaurant name must be a link.
10. Never say "in our database", "in our system", or similar. Speak as if you simply know this — e.g. "one of the best spots I know" or "haven't seen great scores there."
11. When a request is too vague to return useful results (only a location, no cuisine or meal type), use the clarify tool to ask ONE short question before searching. If the request already includes a cuisine, meal type, food type, or restaurant name, skip clarify and search immediately.
12. GEOGRAPHIC SEARCH: When a user describes a location by landmark, intersection, or geographic range (e.g. "near Penn Station", "around Times Square", "between 42nd and 50th street"), use lat/lng/radius_miles instead of neighborhood. Use your knowledge of NYC geography to convert the description to coordinates. For a range like "Penn Station to 50th street", pick the midpoint and set radius_miles to cover the full span. Typical radii: 0.25 mi = a few blocks, 0.5 mi = ~10 block radius, 1.0 mi = a wide swath. You can run multiple searches with different center points if the area is large or oddly shaped.`;

// Cache the system prompt — same text every request, 5-min TTL saves input token processing
const SYSTEM_CACHED = [
  { type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } },
];

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
          description: "Specific GF food available: gf_pizza, gf_pasta, gf_bread, gf_beer, gf_fried_items, gf_desserts, gf_sandwiches, gf_breakfast",
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
        lat: { type: "number", description: "Latitude of the center point for geographic search" },
        lng: { type: "number", description: "Longitude of the center point for geographic search" },
        radius_miles: { type: "number", description: "Search radius in miles around lat/lng (default 0.5). Use 0.25–0.5 for a few blocks, 0.75–1.0 for a wider area." },
      },
    },
  },
  {
    name: "clarify",
    description:
      "Ask the user one short clarifying question when their request is too vague to return useful results. Use this ONLY when you have a location but no cuisine, meal type, or other preference to search with. Do NOT use this if the request already includes a cuisine, meal type, food type, or restaurant name — search immediately in those cases. Ask exactly one question.",
    input_schema: {
      type: "object" as const,
      properties: {
        question: { type: "string", description: "The single clarifying question to ask the user" },
      },
      required: ["question"],
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
];

// Max tool-use rounds per request — prevents runaway loops
const MAX_TOOL_ROUNDS = 3;

// ── Usage helpers ─────────────────────────────────────────────────────────────

type UsageContext =
  | { type: "admin" }
  | { type: "user"; userId: string; count: number; limit: number }
  | { type: "anon"; count: number; limit: number };

async function getUsageContext(): Promise<UsageContext> {
  const serverClient = await createClient();
  const { data: { user } } = await serverClient.auth.getUser();

  if (user) {
    const { data: profile } = await serverClient
      .from("profiles")
      .select("agent_queries_used, agent_query_limit, is_admin")
      .eq("id", user.id)
      .single();

    if (profile?.is_admin) return { type: "admin" };

    return {
      type: "user",
      userId: user.id,
      count: profile?.agent_queries_used ?? 0,
      limit: profile?.agent_query_limit ?? DEFAULT_USER_LIMIT,
    };
  }

  // Anonymous: read count from cookie
  const cookieStore = await cookies();
  const count = parseInt(cookieStore.get(ANON_COOKIE)?.value ?? "0", 10) || 0;
  return { type: "anon", count, limit: ANON_LIMIT };
}

// ── Query logging ─────────────────────────────────────────────────────────────

async function logQuery({
  userId,
  query,
  inputTokens,
  outputTokens,
  toolCalls,
  error,
}: {
  userId: string | null;
  query: string;
  inputTokens: number;
  outputTokens: number;
  toolCalls: number;
  error: boolean;
}) {
  await supabaseServer
    .from("agent_query_logs")
    .insert({
      user_id: userId,
      query,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      tool_calls: toolCalls,
      error,
    })
    .then(({ error: e }) => {
      if (e) console.error("[agent] Failed to log query:", e.message);
    });
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
  const queryLimit = usageCtx.type === "admin" ? Infinity : usageCtx.limit;
  const isUnlimited = usageCtx.type === "admin";
  const userId = usageCtx.type === "user" ? usageCtx.userId : null;

  if (!isUnlimited && queriesUsed >= queryLimit) {
    return Response.json(
      { error: "limit_reached", queries_used: queriesUsed, limit: queryLimit },
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
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      let totalToolCalls = 0;

      try {
        const model = selectModel(query, history.length > 0);

        while (rounds < MAX_TOOL_ROUNDS) {
          // On tool-use rounds: buffer text so pre-tool filler ("Let me search…") is discarded.
          // On the final end_turn round: stream tokens live so the user sees text as it arrives.
          let roundText = "";
          let isEndTurn = false;

          const stream = anthropic.messages.stream({
            model,
            max_tokens: 1024,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            system: SYSTEM_CACHED as any,
            tools: TOOLS,
            messages,
          });

          // Peek at stop_reason before deciding whether to stream live.
          // We do a two-pass approach: collect text, and if end_turn flush live-streamed chunks.
          // Since we can't know stop_reason until finalMessage(), we buffer but send immediately
          // after finalMessage() resolves — the delta arrives as one fast chunk.
          stream.on("text", (text) => { roundText += text; });

          const message = await stream.finalMessage();
          isEndTurn = message.stop_reason === "end_turn";

          // Accumulate token usage across all rounds
          totalInputTokens += message.usage.input_tokens;
          totalOutputTokens += message.usage.output_tokens;

          if (isEndTurn) {
            // Send the buffered response — arrives quickly since model already finished
            if (roundText) send({ type: "delta", text: roundText });

            // Increment DB usage count for logged-in users
            if (usageCtx.type === "user") {
              const serverClient = await createClient();
              await serverClient
                .from("profiles")
                .update({ agent_queries_used: usageCtx.count + 1 })
                .eq("id", usageCtx.userId);
            }

            // Log the completed query
            await logQuery({
              userId,
              query,
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
              toolCalls: totalToolCalls,
              error: false,
            });

            const newCount = isUnlimited ? null : queriesUsed + 1;
            const queriesRemaining = isUnlimited ? null : queryLimit - (newCount ?? 0);

            send({
              type: "done",
              referenced_restaurants: referencedRestaurants,
              queries_remaining: queriesRemaining,
            });
            controller.close();
            return;
          }

          if (message.stop_reason === "tool_use") {
            // clarify ends the turn immediately — send the question as the assistant response
            const clarifyBlock = message.content.find(
              (b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === "clarify"
            );
            if (clarifyBlock) {
              const question = (clarifyBlock.input as { question: string }).question;
              send({ type: "delta", text: question });
              if (usageCtx.type === "user") {
                const serverClient = await createClient();
                await serverClient
                  .from("profiles")
                  .update({ agent_queries_used: usageCtx.count + 1 })
                  .eq("id", usageCtx.userId);
              }
              await logQuery({ userId, query, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolCalls: totalToolCalls, error: false });
              const newCount = isUnlimited ? null : queriesUsed + 1;
              send({ type: "done", referenced_restaurants: [], queries_remaining: isUnlimited ? null : queryLimit - (newCount ?? 0) });
              controller.close();
              return;
            }

            messages.push({ role: "assistant", content: message.content });

            const toolResults: Anthropic.ToolResultBlockParam[] = [];

            for (const block of message.content) {
              if (block.type !== "tool_use") continue;

              totalToolCalls++;
              let result: unknown;
              try {
                switch (block.name) {
                  case "search_restaurants":
                    result = await searchRestaurants(block.input as Parameters<typeof searchRestaurants>[0]);
                    break;
                  case "get_restaurant_details":
                    result = await getRestaurantDetails(block.input as Parameters<typeof getRestaurantDetails>[0]);
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

        await logQuery({ userId, query, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolCalls: totalToolCalls, error: true });
        send({ type: "error", message: "Agent did not produce a response" });
        controller.close();
      } catch (err) {
        console.error("[/api/agent] Error:", err);
        await logQuery({ userId, query, inputTokens: totalInputTokens, outputTokens: totalOutputTokens, toolCalls: totalToolCalls, error: true });
        send({ type: "error", message: "Failed to get response from agent" });
        controller.close();
      }
    },
  });

  return new Response(body, { headers: responseHeaders });
}
