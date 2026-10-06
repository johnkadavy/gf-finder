"use client";

import { useEffect, useRef, useState } from "react";
import { capture } from "@/lib/analytics";
import { FEEDBACK_REASONS, type FeedbackReason } from "@/lib/feedback";

// "Did this help you decide?" — the restaurant page's success measure
// (docs/DESIGN_BRIEF.md). Mobile: a bar slides up above the bottom nav once the
// visitor scrolls past the signal tiles (fixed, so nothing in the page moves).
// Desktop: a quiet inline row docked under the signal tiles.

type Surface = "mobile_float" | "desktop_inline";
type Status = "idle" | "down" | "done";

const QUESTION = "Did this help you decide?";
const THANKS = "✓ Thanks, that helps";

// ── Per-browser memory (best-effort; the prompt works without storage) ─────

const STORE_KEY = "cp_helpful_v1";
const CLIENT_KEY = "cp_client_id";
const DISMISS_LIMIT = 3;
const DISMISS_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type Store = { answered: Record<string, number>; dismissed: Record<string, number>; dismissals: number[] };

function readStore(): Store {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
    if (parsed && typeof parsed === "object") {
      return {
        answered: parsed.answered ?? {},
        dismissed: parsed.dismissed ?? {},
        dismissals: Array.isArray(parsed.dismissals) ? parsed.dismissals : [],
      };
    }
  } catch {}
  return { answered: {}, dismissed: {}, dismissals: [] };
}

function updateStore(fn: (s: Store) => void) {
  try {
    const s = readStore();
    fn(s);
    s.dismissals = s.dismissals.filter((t) => Date.now() - t < DISMISS_WINDOW_MS);
    localStorage.setItem(STORE_KEY, JSON.stringify(s));
  } catch {}
}

let sessionClientId: string | null = null;
function getClientId(): string {
  try {
    const existing = localStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    localStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    sessionClientId ??= crypto.randomUUID();
    return sessionClientId;
  }
}

const isDesktop = () => window.matchMedia("(min-width: 768px)").matches;

// ── Icons ───────────────────────────────────────────────────────────────────

function ThumbUp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 10v11H3V10h4z" />
      <path d="M7 10l4-8c1.7 0 3 1.3 3 3v3h5.5a2 2 0 012 2.3l-1.4 8.4A2 2 0 0118.1 21H7" />
    </svg>
  );
}

function ThumbDown() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 14V3h4v11h-4z" />
      <path d="M17 14l-4 8c-1.7 0-3-1.3-3-3v-3H4.5a2 2 0 01-2-2.3l1.4-8.4A2 2 0 015.9 3H17" />
    </svg>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export function HelpfulFeedback({
  restaurantId,
  score,
  attached,
}: {
  restaurantId: number;
  score: number | null;
  /** Docked under the signal tiles (shares their border) vs. standalone. */
  attached: boolean;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [reason, setReason] = useState<FeedbackReason | null>(null);
  const [note, setNote] = useState("");
  const [answeredBefore, setAnsweredBefore] = useState(false);
  const [floatOpen, setFloatOpen] = useState(false);
  const [followInView, setFollowInView] = useState(false);
  // Which presentation the visitor is answering in (detail panel renders there).
  const [activeSurface, setActiveSurface] = useState<Surface>("mobile_float");

  const sentinelRef = useRef<HTMLDivElement>(null);
  const inlineRef = useRef<HTMLDivElement>(null);
  const key = String(restaurantId);

  // Mobile: slide up once the visitor has scrolled past the signal tiles —
  // unless they've answered or dismissed it here, or dismissed it 3× recently.
  useEffect(() => {
    const store = readStore();
    const answered = !!store.answered[key];
    if (answered) setAnsweredBefore(true);
    const recentDismissals = store.dismissals.filter((t) => Date.now() - t < DISMISS_WINDOW_MS).length;
    if (answered || store.dismissed[key] || recentDismissals >= DISMISS_LIMIT) return;

    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (isDesktop()) return;
      if (entry.isIntersecting || entry.boundingClientRect.top < 0) {
        observer.disconnect();
        setFloatOpen(true);
        capture("helpful_prompt_shown", { restaurant_id: restaurantId, surface: "mobile_float" });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [key, restaurantId]);

  // Desktop: count an impression when the inline row scrolls into view.
  useEffect(() => {
    const el = inlineRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && isDesktop() && !readStore().answered[key]) {
          observer.disconnect();
          capture("helpful_prompt_shown", { restaurant_id: restaurantId, surface: "desktop_inline" });
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [key, restaurantId]);

  // Never stack the bar on top of the subscribe prompt.
  useEffect(() => {
    const el = document.querySelector("[data-follow-prompt]");
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setFollowInView(entry.isIntersecting));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // After answering, the bar thanks the visitor and slides away.
  useEffect(() => {
    if (status !== "done" || !floatOpen) return;
    const t = setTimeout(() => setFloatOpen(false), 2000);
    return () => clearTimeout(t);
  }, [status, floatOpen]);

  function send(surface: Surface, vote: 1 | -1, detail?: { reason: FeedbackReason | null; note: string }) {
    updateStore((s) => { s.answered[key] = Date.now(); });
    // Fire-and-forget: feedback must never block or error at the visitor.
    fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restaurant_id: restaurantId,
        client_id: getClientId(),
        vote,
        reason: detail?.reason ?? null,
        note: detail?.note ?? "",
        score,
        surface,
      }),
    })
      .then((res) => {
        if (!res.ok) return;
        capture("helpful_feedback_submitted", {
          restaurant_id: restaurantId,
          vote: vote === 1 ? "up" : "down",
          step: detail ? "detail" : "vote",
          reason: detail?.reason ?? null,
          has_note: !!detail?.note.trim(),
          surface,
        });
      })
      .catch(() => {});
  }

  function onUp(surface: Surface) {
    setActiveSurface(surface);
    setStatus("done");
    send(surface, 1);
  }

  function onDown(surface: Surface) {
    if (status === "down") return;
    setActiveSurface(surface);
    setStatus("down");
    send(surface, -1); // saved on tap; the reason step is optional
  }

  function onSendDetail() {
    setStatus("done");
    if (reason || note.trim()) send(activeSurface, -1, { reason, note: note.trim() });
  }

  function onDismiss() {
    setFloatOpen(false);
    updateStore((s) => { s.dismissed[key] = Date.now(); s.dismissals.push(Date.now()); });
    capture("helpful_prompt_dismissed", { restaurant_id: restaurantId, surface: "mobile_float" });
  }

  // ── Pieces ────────────────────────────────────────────────────────────────

  const showThanks = status === "done" || (answeredBefore && status === "idle");
  const hasDetail = !!reason || !!note.trim();

  const thanks = (
    <div className="flex items-center min-h-14 px-4 md:px-5">
      <p className="font-mono text-ui-md uppercase tracking-label text-signal-positive" role="status">{THANKS}</p>
    </div>
  );

  // Yes / No buttons. Mobile: two big labeled half-width buttons. Desktop: compact icon squares.
  function voteButtons(surface: Surface) {
    const mobile = surface === "mobile_float";
    const base = mobile
      ? "flex-1 h-12 border inline-flex items-center justify-center gap-2.5 font-mono text-ui-md uppercase tracking-label transition-colors duration-150 focus-visible:outline-none active:bg-accent-tint-md"
      : "w-11 h-11 shrink-0 border flex items-center justify-center transition-colors duration-150 focus-visible:outline-none hover:text-accent hover:border-accent";
    const idle = mobile
      ? { borderColor: "var(--accent-tint-xl)", color: "var(--accent)", backgroundColor: "var(--accent-tint-xs)" }
      : { borderColor: "var(--border-default)", color: "var(--text-label)" };
    const on = { borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "var(--accent-tint-md)" };
    return (
      <>
        <button type="button" aria-label="Yes, this helped" onClick={() => onUp(surface)} className={base} style={idle}>
          <ThumbUp />
          {mobile && <span aria-hidden="true">Yes</span>}
        </button>
        <button
          type="button"
          aria-label="No, this didn't help"
          aria-pressed={status === "down"}
          aria-expanded={status === "down"}
          onClick={() => onDown(surface)}
          className={base}
          style={status === "down" ? on : idle}
        >
          <ThumbDown />
          {mobile && <span aria-hidden="true">No</span>}
        </button>
      </>
    );
  }

  // Mobile bar header: question + dismiss on one line, Yes / No below.
  const mobileHeader = showThanks ? thanks : (
    <div className="px-4 pt-3 pb-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <p
          className="font-[family-name:var(--font-display)] leading-none text-text-primary"
          style={{ fontSize: "1.6rem", letterSpacing: "0.02em" }}
        >
          {QUESTION}
        </p>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="w-11 h-11 -mr-3 shrink-0 flex items-center justify-center font-mono text-ui-xl text-text-dim transition-colors hover:text-text-primary"
        >
          ✕
        </button>
      </div>
      <div className="flex gap-2">{voteButtons("mobile_float")}</div>
    </div>
  );

  // Desktop inline row: question left, icon thumbs right.
  const desktopHeader = showThanks ? thanks : (
    <div className="flex items-center justify-between gap-3 min-h-14 py-1.5 pl-5 pr-1.5">
      <p className="font-mono text-ui-sm uppercase tracking-label text-text-label">{QUESTION}</p>
      <div className="flex items-center gap-1.5">{voteButtons("desktop_inline")}</div>
    </div>
  );

  const detailPanel = status === "down" && (
    <div className="px-4 md:px-5 pt-4 pb-4 md:pb-5 border-t" style={{ borderColor: "var(--border-default)" }}>
      <p className="font-mono text-ui-sm uppercase tracking-label text-text-secondary mb-1">What was missing?</p>
      <p className="font-sans text-ui-lg text-text-dim mb-3.5">Your vote is saved. Adding detail is optional.</p>

      <div className="grid grid-cols-2 gap-2 md:flex md:flex-wrap mb-3">
        {FEEDBACK_REASONS.map((r) => {
          const active = reason === r.value;
          return (
            <button
              key={r.value}
              type="button"
              aria-pressed={active}
              onClick={() => setReason(active ? null : r.value)}
              className="h-12 md:h-11 px-3 md:px-4 last:col-span-2 border inline-flex items-center justify-center text-center font-mono text-ui-sm uppercase tracking-label transition-colors duration-150"
              style={{
                borderColor: active ? "var(--accent)" : "var(--border-emphasis)",
                backgroundColor: active ? "var(--accent-tint-md)" : "var(--surface-elevated)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
              }}
            >
              {r.label}
            </button>
          );
        })}
      </div>

      <label className="sr-only" htmlFor={`helpful-note-${restaurantId}`}>Anything else?</label>
      <textarea
        id={`helpful-note-${restaurantId}`}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Anything else? (optional)"
        className="w-full md:max-w-xl block border px-3.5 py-3 font-sans text-ui-body leading-snug text-text-primary placeholder:text-text-disabled resize-none focus-visible:outline-none"
        style={{ borderColor: "var(--border-emphasis)", backgroundColor: "var(--surface-base)" }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
      />

      <button
        type="button"
        onClick={onSendDetail}
        className="mt-3 w-full md:w-auto h-12 md:h-11 px-8 font-mono text-ui-md uppercase tracking-label transition-opacity duration-150 hover:opacity-90 focus-visible:outline-none"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)" }}
      >
        {hasDetail ? "Send" : "Done"}
      </button>
    </div>
  );

  const floatVisible = floatOpen && (!followInView || status === "down");

  return (
    <>
      {/* Scroll trigger for the mobile bar — sits right after the signal tiles */}
      <div ref={sentinelRef} aria-hidden="true" className="h-0" />

      {/* Desktop: inline row docked under the signal tiles */}
      <section
        ref={inlineRef}
        aria-label="Page feedback"
        className={`hidden md:block border ${attached ? "border-t-0" : ""}`}
        style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
      >
        {desktopHeader}
        {activeSurface === "desktop_inline" && detailPanel}
      </section>

      {/* Mobile: fixed bar above the bottom nav (slides under the nav when hidden) */}
      <section
        aria-label="Page feedback"
        aria-hidden={!floatVisible}
        inert={!floatVisible}
        className="md:hidden fixed left-0 right-0 z-40 max-h-[75dvh] overflow-y-auto overscroll-contain border-t transition-transform duration-300 ease-out motion-reduce:transition-none"
        style={{
          bottom: "calc(env(safe-area-inset-bottom) + 3.625rem)",
          borderTopColor: "var(--accent)",
          backgroundColor: "var(--surface-raised)",
          transform: floatVisible ? "translateY(0)" : "translateY(calc(100% + 4rem))",
        }}
      >
        {mobileHeader}
        {activeSurface === "mobile_float" && detailPanel}
      </section>
    </>
  );
}
