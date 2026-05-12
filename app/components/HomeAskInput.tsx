"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
    router.push(`/ask?q=${encodeURIComponent(q)}`);
  }

  function handleExample(q: string) {
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
          className="flex-1 border px-4 py-3 font-mono text-[13px] placeholder:text-[oklch(0.38_0_0)] text-[oklch(0.88_0_0)] focus:outline-none transition-colors duration-150"
          style={{ backgroundColor: "oklch(0.11 0 0)", borderColor: "oklch(0.28 0 0)" }}
          onFocus={(e) => (e.currentTarget.style.borderColor = "oklch(0.45 0 0)")}
          onBlur={(e) => (e.currentTarget.style.borderColor = "oklch(0.28 0 0)")}
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="shrink-0 px-5 py-3 font-mono text-[11px] uppercase tracking-[0.15em] transition-colors duration-150 disabled:opacity-40"
          style={{ backgroundColor: "#FF7444", color: "oklch(0.08 0 0)" }}
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
            className="font-mono text-[10px] tracking-[0.08em] px-3 py-1.5 border transition-colors duration-150 text-left"
            style={{ borderColor: "oklch(0.22 0 0)", backgroundColor: "oklch(0.1 0 0)", color: "oklch(0.55 0 0)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "#FF744450"; e.currentTarget.style.color = "oklch(0.82 0 0)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "oklch(0.22 0 0)"; e.currentTarget.style.color = "oklch(0.55 0 0)"; }}
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
