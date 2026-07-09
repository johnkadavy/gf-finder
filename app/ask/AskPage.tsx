"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Image from "next/image";
import { marked, Renderer } from "marked";
import { capture } from "@/lib/analytics";

const SUGGESTED_QUERIES = [
  "What's safe for celiac in the East Village?",
  "I need GF pizza in Williamsburg",
  "Best GF brunch in NYC",
  "Does Modern Bread and Bagel have a dedicated GF kitchen?",
  "GF bakery on the Upper West Side",
  "Quick GF lunch options in Midtown",
];

type Message = {
  role: "user" | "assistant";
  content: string;
};

// ── Markdown renderer ────────────────────────────────────────────────────────
// Uses `marked` for reliable parsing of all markdown patterns Claude outputs.

const chatRenderer = new Renderer();

// All links open in a new tab so the chat session stays intact.
// Strip stray parentheses from hrefs — the model occasionally outputs a format
// that marked doesn't fully parse, leaving literal ( ) characters in the href.
chatRenderer.link = function({ href, text }: { href: string; title?: string | null; text: string }) {
  if (!href) return text;
  const cleanHref = href.replace(/^\(+/, "").replace(/\)+$/, "");
  return `<a href="${cleanHref}" target="_blank" rel="noopener noreferrer">${text}</a>`;
};

marked.use({
  renderer: chatRenderer,
  gfm: true,
  breaks: false,
});

function renderContent(text: string) {
  // Strip any raw <script> tags as a basic precaution (Claude output only)
  const safe = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  const html = marked.parse(safe) as string;
  return <div className="agent-message" dangerouslySetInnerHTML={{ __html: html }} />;
}

// ── CleanPlate avatar ────────────────────────────────────────────────────────

function CPAvatar() {
  return (
    <div
      className="w-6 h-6 shrink-0 flex items-center justify-center rounded-full overflow-hidden"
      style={{ backgroundColor: "var(--accent-tint-md)", border: "1px solid var(--accent-tint-lg)" }}
    >
      <Image src="/guanaco_logo.svg" alt="CleanPlate" width={14} height={14} />
    </div>
  );
}

// ── Typing indicator ─────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div className="flex items-end gap-3 px-4 md:px-6 py-3">
      <CPAvatar />
      <div
        className="flex items-center gap-1 px-3 py-2.5 rounded-sm"
        style={{ backgroundColor: "var(--surface-elevated)" }}
      >
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="block w-1.5 h-1.5 rounded-full animate-bounce"
            style={{ backgroundColor: "var(--text-disabled)", animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

// ── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ onSelect }: { onSelect: (q: string) => void }) {
  return (
    <div className="flex flex-col items-center justify-center h-full px-4 py-12 text-center">
      <div
        className="w-10 h-10 flex items-center justify-center rounded-full mb-5"
        style={{ backgroundColor: "var(--accent-tint-sm)", border: "1px solid var(--accent-tint-md)" }}
      >
        <span className="font-[family-name:var(--font-display)]" style={{ color: "var(--accent)", fontSize: "1.1rem" }}>C</span>
      </div>
      <p
        className="font-[family-name:var(--font-display)] mb-1"
        style={{ fontSize: "clamp(1.4rem, 4vw, 2rem)", color: "var(--text-primary)", letterSpacing: "0.02em" }}
      >
        Ask CleanPlate
      </p>
      <p className="font-mono text-ui-md uppercase tracking-editorial text-text-disabled mb-8">
        GF safety data for 3,500+ NYC restaurants
      </p>
      <div className="flex flex-wrap gap-2 justify-center max-w-lg">
        {SUGGESTED_QUERIES.map((s) => (
          <button
            key={s}
            onClick={() => onSelect(s)}
            className="font-mono text-ui-sm tracking-snug px-3 py-2 border transition-colors duration-150 text-left"
            style={{ borderColor: "var(--border-subtle)", backgroundColor: "var(--surface-raised)", color: "var(--text-dim)" }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "oklch(0.35 0 0)"; e.currentTarget.style.color = "var(--text-secondary)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--border-subtle)"; e.currentTarget.style.color = "var(--text-dim)"; }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

export function AskPage({ initialQuery = "" }: { initialQuery?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const [queriesRemaining, setQueriesRemaining] = useState<number | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Always-current ref so submit() reads live history without a stale closure
  const messagesRef = useRef<Message[]>(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);

  // Character drip queue — smooths out chunky SSE bursts into a continuous typing effect
  const pendingCharsRef = useRef<string>("");
  const isDrippingRef = useRef(false);

  function scheduleDrip() {
    if (isDrippingRef.current) return;
    isDrippingRef.current = true;
    function tick() {
      const pending = pendingCharsRef.current;
      if (pending.length === 0) {
        isDrippingRef.current = false;
        return;
      }
      // Drain faster when queue is large (catching up after a big chunk)
      const take = pending.length > 30 ? 4 : pending.length > 10 ? 2 : 1;
      const chars = pending.slice(0, take);
      pendingCharsRef.current = pending.slice(take);
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === "assistant" && last.content !== "__limit_reached__") {
          return [...prev.slice(0, -1), { ...last, content: last.content + chars }];
        }
        return prev;
      });
      setTimeout(tick, 12);
    }
    setTimeout(tick, 12);
  }

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  function scrollToBottom() {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }

  const submit = useCallback(async function submit(text: string) {
    const trimmed = text.trim();
    if (!trimmed || loading || limitReached) return;

    // Snapshot history before adding the new user message (sent to API for context)
    const history = messagesRef.current
      .filter((m) => m.content !== "__limit_reached__")
      .map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, { role: "user", content: trimmed }]);
    setInput("");
    setLoading(true);
    pendingCharsRef.current = "";
    // Scroll to show the user's message
    setTimeout(scrollToBottom, 50);

    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed, history }),
      });

      // Limit reached — not a stream, plain JSON error
      if (res.status === 402) {
        capture("agent_query", { outcome: "limit_reached", query_length: trimmed.length, is_followup: history.length > 0 });
        setLimitReached(true);
        setMessages((prev) => [...prev, { role: "assistant", content: "__limit_reached__" }]);
        setLoading(false);
        return;
      }

      if (!res.ok || !res.body) {
        capture("agent_query", { outcome: "error", query_length: trimmed.length, is_followup: history.length > 0 });
        setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
        setLoading(false);
        return;
      }

      // Read SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistantAdded = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          if (!part.startsWith("data: ")) continue;
          let event: { type: string; text?: string; queries_remaining?: number; message?: string };
          try {
            event = JSON.parse(part.slice(6));
          } catch {
            continue;
          }

          if (event.type === "delta" && event.text) {
            if (!assistantAdded) {
              // First token: add empty assistant message, drop the typing indicator
              setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
              setLoading(false);
              assistantAdded = true;
              // Scroll once to show the new assistant message — then leave it alone
              setTimeout(scrollToBottom, 50);
            }
            // Push incoming text to the drip queue instead of updating state directly
            pendingCharsRef.current += event.text;
            scheduleDrip();
          } else if (event.type === "done") {
            if (event.queries_remaining !== null && event.queries_remaining !== undefined) {
              setQueriesRemaining(event.queries_remaining);
            }
            capture("agent_query", {
              outcome: "ok",
              query_length: trimmed.length,
              is_followup: history.length > 0,
              queries_remaining: event.queries_remaining ?? null,
            });
          } else if (event.type === "error") {
            capture("agent_query", { outcome: "error", query_length: trimmed.length, is_followup: history.length > 0 });
            setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
            setLoading(false);
          }
        }
      }
    } catch {
      capture("agent_query", { outcome: "error", query_length: trimmed.length, is_followup: history.length > 0 });
      setMessages((prev) => [...prev, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limitReached]);

  // Auto-submit when navigated from homepage with a pre-filled query.
  // Ref guard prevents double-fire in React StrictMode (dev only).
  const autoSubmittedRef = useRef(false);
  useEffect(() => {
    if (initialQuery && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      submit(initialQuery);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit(input);
    }
  }

  const hasMessages = messages.length > 0;

  return (
    // Full viewport height minus top nav (64px). On mobile, bottom nav adds 64px so we pad input.
    <div
      className="flex flex-col"
      style={{ height: "calc(100dvh - 64px)", marginTop: "64px" }}
    >
      {/* ── Message thread ── */}
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto">
        {!hasMessages ? (
          <EmptyState onSelect={(q) => { setInput(q); submit(q); }} />
        ) : (
          <div className="max-w-2xl mx-auto px-4 md:px-6 py-6 space-y-1">
            {messages.map((msg, i) =>
              msg.role === "user" ? (
                // User bubble — right aligned
                <div key={i} className="flex justify-end pt-3 pb-1">
                  <div
                    className="max-w-[80%] px-4 py-3 text-ui-lg leading-relaxed font-mono"
                    style={{
                      backgroundColor: "var(--accent-tint-xs)",
                      border: "1px solid var(--accent-tint-md)",
                      color: "oklch(0.88 0 0)",
                    }}
                  >
                    {msg.content}
                  </div>
                </div>
              ) : msg.content === "__limit_reached__" ? (
                // Paywall message
                <div key={i} className="flex items-end gap-3 pt-2 pb-1">
                  <CPAvatar />
                  <div
                    className="flex-1 px-4 py-4 border text-center space-y-2"
                    style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
                  >
                    <p className="font-mono text-ui-md uppercase tracking-editorial text-text-tertiary">
                      You&apos;ve used your 5 free queries
                    </p>
                    <p className="font-mono text-ui-sm text-text-disabled">
                      Upgrade to CleanPlate Premium for unlimited access.
                    </p>
                    <p className="font-mono text-ui-md uppercase tracking-label" style={{ color: "var(--accent)" }}>
                      $7 / month — coming soon
                    </p>
                  </div>
                </div>
              ) : (
                // Assistant message — left aligned
                <div key={i} className="flex items-start gap-3 pt-2 pb-1">
                  <div className="mt-0.5">
                    <CPAvatar />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div
                      className="text-ui-2xl leading-[1.7]"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {renderContent(msg.content)}
                    </div>
                  </div>
                </div>
              )
            )}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* ── Input bar ── */}
      <div
        className="shrink-0 border-t px-4 md:px-6 pt-3 pb-20 md:pb-4"
        style={{ backgroundColor: "var(--surface-base)", borderColor: "var(--border-subtle)" }}
      >
        <div className="max-w-2xl mx-auto">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={limitReached ? "Upgrade to ask more questions" : "Ask about GF dining in NYC…"}
              rows={1}
              disabled={loading || limitReached}
              className="flex-1 resize-none border px-3 py-2.5 font-mono text-ui-lg leading-relaxed placeholder:text-[oklch(0.35_0_0)] text-[oklch(0.88_0_0)] focus:outline-none transition-colors duration-150 disabled:opacity-40"
              style={{
                backgroundColor: "var(--surface-elevated)",
                borderColor: "var(--border-default)",
                maxHeight: "120px",
                overflowY: "auto",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "oklch(0.38 0 0)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-default)")}
              onInput={(e) => {
                // Auto-grow textarea
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
              }}
            />
            <button
              onClick={() => submit(input)}
              disabled={!input.trim() || loading || limitReached}
              className="shrink-0 w-9 h-9 flex items-center justify-center border transition-colors duration-150 disabled:opacity-30 disabled:cursor-not-allowed"
              style={{ borderColor: "var(--accent)", backgroundColor: "var(--accent-tint-md)", color: "var(--accent)" }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19V5M5 12l7-7 7 7" />
              </svg>
            </button>
          </div>

          {/* Usage counter */}
          <p className="font-mono text-ui-xs uppercase tracking-broad text-[oklch(0.36_0_0)] mt-2">
            {limitReached
              ? "Query limit reached"
              : queriesRemaining !== null
              ? `${queriesRemaining} free quer${queriesRemaining === 1 ? "y" : "ies"} remaining`
              : "5 free queries · No account needed"}
          </p>
        </div>
      </div>
    </div>
  );
}
