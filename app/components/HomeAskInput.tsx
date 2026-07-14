"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { capture } from "@/lib/analytics";

const EXAMPLE_QUERIES = [
  "What's safe for celiac in the East Village?",
  "Best GF pizza in NYC",
  "GF brunch spots in the West Village",
  "Is Soda Club safe for celiac?",
];

export function HomeAskInput() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    capture("home_ask_submitted", { source: "input", query_length: q.length });
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  function handleExample(q: string) {
    capture("home_ask_submitted", { source: "example", query_length: q.length });
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Ask about GF dining in NYC…"
          autoComplete="off"
          className="flex-1 border px-4 py-3 font-mono text-ui-lg placeholder:text-text-disabled text-text-secondary focus:outline-none transition-colors duration-150"
          style={{ backgroundColor: "var(--surface-elevated)", borderColor: "var(--border-emphasis)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "var(--text-disabled)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")}
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="shrink-0 px-5 py-3 font-mono text-ui-md uppercase tracking-label transition-colors duration-150 disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)", color: "var(--surface-base)" }}
        >
          Ask
        </button>
      </form>

      {/* Example queries */}
      <div className="flex flex-wrap gap-2 mt-4">
        {EXAMPLE_QUERIES.map((q) => (
          <button
            key={q}
            onClick={() => handleExample(q)}
            className="font-mono text-ui-sm tracking-snug px-3 py-1.5 border transition-colors duration-150 text-left"
            style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)", color: "var(--text-dim)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--accent-tint-lg)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
