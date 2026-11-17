/**
 * Lenient JSON parsing for Airtable AI fields.
 *
 * Relative imports only: also used by scripts/ run via tsx.
 */

/**
 * Parse JSON from an AI field that may wrap it in prose or markdown fences
 * (agentic web-search fields often narrate their findings before the JSON).
 * Tries the whole string, then fenced blocks, then each `{`/`[` paired with the
 * last matching closer. Returns undefined if nothing parses.
 */
export function parseAiJson(text: string): unknown {
  const tryParse = (s: string): unknown => {
    try { return JSON.parse(s); } catch { return undefined; }
  };

  const trimmed = text.trim();
  const whole = tryParse(trimmed);
  if (whole !== undefined) return whole;

  for (const m of trimmed.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fenced = tryParse(m[1].trim());
    if (fenced !== undefined) return fenced;
  }

  // Scan left to right so an outer array wins over the objects inside it.
  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== "{" && ch !== "[") continue;
    const end = trimmed.lastIndexOf(ch === "{" ? "}" : "]");
    if (end <= i) continue;
    const parsed = tryParse(trimmed.slice(i, end + 1));
    if (parsed !== undefined) return parsed;
  }
  return undefined;
}

/** Like parseAiJson, but throws when nothing parses (for callers that treat it as an error). */
export function parseAiJsonOrThrow(text: string): unknown {
  const v = parseAiJson(text);
  if (v === undefined) throw new SyntaxError("No valid JSON found in AI field");
  return v;
}
