"use client";

import { useState, useRef, useEffect } from "react";

const SUGGESTED_QUERIES = [
  "What's safe for celiac in the East Village?",
  "I need GF pizza in Williamsburg",
  "Best GF brunch in NYC",
  "Does Modern Bread and Bagel have a dedicated GF kitchen?",
  "GF bakery on the Upper West Side",
  "Quick GF lunch options in Midtown",
];

// ── Simple markdown renderer ─────────────────────────────────────────────────
// Handles the patterns Claude's responses use: **bold**, ---, and line breaks.
// Avoids a heavy dependency for v1.

function renderResponse(text: string) {
  const paragraphs = text.split(/\n\n+/);
  return paragraphs.map((para, i) => {
    if (para.trim() === "---") {
      return <hr key={i} style={{ borderColor: "oklch(0.2 0 0)", margin: "1rem 0" }} />;
    }
    const lines = para.split("\n").map((line, j) => {
      const parts = line.split(/\*\*(.+?)\*\*/g);
      const rendered = parts.map((part, k) =>
        k % 2 === 1 ? <strong key={k} style={{ color: "oklch(0.92 0 0)" }}>{part}</strong> : part
      );
      return (
        <span key={j}>
          {j > 0 && <br />}
          {rendered}
        </span>
      );
    });
    return (
      <p key={i} className="leading-relaxed" style={{ marginBottom: "0.75rem" }}>
        {lines}
      </p>
    );
  });
}

// ── Loading skeleton ─────────────────────────────────────────────────────────

function ResponseSkeleton() {
  return (
    <div className="animate-pulse space-y-3 pt-2">
      {[85, 65, 90, 55, 75].map((w, i) => (
        <div
          key={i}
          className="h-3 rounded"
          style={{ width: `${w}%`, backgroundColor: "oklch(0.15 0 0)" }}
        />
      ))}
      <div className="pt-2 space-y-3">
        {[70, 80, 60].map((w, i) => (
          <div
            key={i}
            className="h-3 rounded"
            style={{ width: `${w}%`, backgroundColor: "oklch(0.15 0 0)" }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AskPage() {
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastQuery, setLastQuery] = useState<string | null>(null);
  const [queriesRemaining, setQueriesRemaining] = useState<number | null>(null);
  const responseRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to response when it arrives
  useEffect(() => {
    if (response && responseRef.current) {
      responseRef.current.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [response]);

  async function submit(q: string) {
    const trimmed = q.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);
    setResponse(null);
    setLastQuery(trimmed);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error === "limit_reached"
          ? "limit_reached"
          : "Something went wrong. Please try again.");
      } else {
        setResponse(data.response);
        if (data.queries_remaining !== null && data.queries_remaining !== undefined) {
          setQueriesRemaining(data.queries_remaining);
        }
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  function handleSuggestion(s: string) {
    setQuery(s);
    submit(s);
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(query);
    }
  }

  return (
    <main className="pt-16 pb-32 md:pb-24">
      {/* Hero / input area */}
      <section
        className="grid-bg border-b px-4 md:px-8 py-12 md:py-20"
        style={{ borderColor: "oklch(0.22 0 0)" }}
      >
        <div className="max-w-2xl mx-auto">
          <p className="font-mono text-[10px] uppercase tracking-[0.3em] text-[oklch(0.55_0_0)] mb-4">
            Ask CleanPlate
          </p>
          <h1
            className="font-[family-name:var(--font-display)] leading-none mb-8"
            style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", letterSpacing: "0.02em" }}
          >
            What can I help<br />
            <span style={{ color: "#FF7444" }}>you find?</span>
          </h1>

          {/* Input */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={'e.g. \u201cSafe GF pizza in the East Village\u201d'}
              rows={2}
              disabled={loading}
              className="w-full resize-none border px-4 py-4 pr-24 font-mono text-[13px] leading-relaxed placeholder:text-[oklch(0.4_0_0)] text-[oklch(0.88_0_0)] focus:outline-none transition-colors duration-150 disabled:opacity-50"
              style={{
                backgroundColor: "oklch(0.09 0 0)",
                borderColor: "oklch(0.26 0 0)",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "oklch(0.42 0 0)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "oklch(0.26 0 0)")}
            />
            <button
              onClick={() => submit(query)}
              disabled={!query.trim() || loading}
              className="absolute right-3 bottom-3 font-mono text-[10px] uppercase tracking-[0.18em] px-4 py-2 border transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{
                borderColor: "#FF7444",
                backgroundColor: "#FF744420",
                color: "#FF7444",
              }}
            >
              {loading ? "..." : "Ask"}
            </button>
          </div>

          {/* Usage counter */}
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[oklch(0.42_0_0)] mt-3">
            {queriesRemaining !== null
              ? `${queriesRemaining} free quer${queriesRemaining === 1 ? "y" : "ies"} remaining`
              : "5 free queries · No account needed"}
          </p>

          {/* Suggested queries */}
          {!response && !loading && (
            <div className="mt-6">
              <p className="font-mono text-[9px] uppercase tracking-[0.22em] text-[oklch(0.45_0_0)] mb-3">
                Try asking
              </p>
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_QUERIES.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSuggestion(s)}
                    className="font-mono text-[10px] tracking-[0.1em] px-3 py-1.5 border transition-colors duration-150 text-left"
                    style={{
                      borderColor: "oklch(0.22 0 0)",
                      backgroundColor: "oklch(0.1 0 0)",
                      color: "oklch(0.62 0 0)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = "oklch(0.38 0 0)";
                      e.currentTarget.style.color = "oklch(0.8 0 0)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = "oklch(0.22 0 0)";
                      e.currentTarget.style.color = "oklch(0.62 0 0)";
                    }}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Response area */}
      {(loading || response || error) && (
        <section className="px-4 md:px-8 pt-10" ref={responseRef}>
          <div className="max-w-2xl mx-auto">

            {/* Question echo */}
            {lastQuery && (
              <p
                className="font-mono text-[10px] uppercase tracking-[0.22em] mb-6 pb-4 border-b"
                style={{ color: "oklch(0.52 0 0)", borderColor: "oklch(0.18 0 0)" }}
              >
                {lastQuery}
              </p>
            )}

            {/* Loading */}
            {loading && <ResponseSkeleton />}

            {/* Error */}
            {error && error !== "limit_reached" && (
              <p className="font-mono text-[12px] text-[#FF7444]">{error}</p>
            )}

            {/* Limit reached */}
            {error === "limit_reached" && (
              <div
                className="border p-6 text-center space-y-3"
                style={{ borderColor: "oklch(0.22 0 0)" }}
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[oklch(0.7_0_0)]">
                  You&apos;ve used your 5 free queries
                </p>
                <p className="font-mono text-[10px] text-[oklch(0.5_0_0)]">
                  Upgrade to CleanPlate Premium for unlimited access.
                </p>
                <p className="font-mono text-[11px] uppercase tracking-[0.15em]" style={{ color: "#FF7444" }}>
                  $7 / month — coming soon
                </p>
              </div>
            )}

            {/* Response */}
            {response && (
              <>
                <div
                  className="text-[14px] leading-relaxed"
                  style={{ color: "oklch(0.78 0 0)" }}
                >
                  {renderResponse(response)}
                </div>

                {/* Ask another */}
                <div
                  className="mt-8 pt-6 border-t flex items-center justify-between"
                  style={{ borderColor: "oklch(0.18 0 0)" }}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.45_0_0)]">
                    Ask another question
                  </span>
                  <button
                    onClick={() => {
                      setResponse(null);
                      setQuery("");
                      setLastQuery(null);
                      inputRef.current?.focus();
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                    className="font-mono text-[10px] uppercase tracking-[0.18em] px-4 py-2 border transition-colors duration-150"
                    style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.65 0 0)" }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = "white";
                      e.currentTarget.style.borderColor = "oklch(0.5 0 0)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = "oklch(0.65 0 0)";
                      e.currentTarget.style.borderColor = "oklch(0.28 0 0)";
                    }}
                  >
                    ↑ New Question
                  </button>
                </div>
              </>
            )}
          </div>
        </section>
      )}
    </main>
  );
}
