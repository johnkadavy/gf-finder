"use client";

import { useState, useId, useRef, useEffect } from "react";
import { track } from "@vercel/analytics";
import { capture } from "@/lib/analytics";

type Props = {
  variant: "table" | "inline" | "section";
  followType: "neighborhood" | "category";
  followTarget: string;
  contextLabel: string;
  sourcePage: string;
};

type SubmitState = "idle" | "loading" | "success" | "error";

export function FollowPrompt({ variant, followType, followTarget, contextLabel, sourcePage }: Props) {
  const [email, setEmail] = useState("");
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const inputId = useId();

  // Impression tracking — fires once when the prompt scrolls into view
  const containerRef = useRef<HTMLElement | null>(null);
  const impressionFired = useRef(false);
  useEffect(() => {
    const el = containerRef.current;
    if (!el || impressionFired.current) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !impressionFired.current) {
          impressionFired.current = true;
          track("follow_prompt_impression", { follow_type: followType, follow_target: followTarget, variant });
          capture("follow_prompt_impression", { follow_type: followType, follow_target: followTarget, variant });
          observer.disconnect();
        }
      },
      { threshold: 0.5 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const copy =
    followType === "neighborhood"
      ? `Following ${contextLabel} — get notified when a top-rated GF spot opens here`
      : `Get notified when a new top-rated GF spot is added to ${contextLabel}`;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitState("loading");
    setErrorMsg(null);
    try {
      const res = await fetch("/api/follows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          follow_type: followType,
          follow_target: followTarget,
          source_page: sourcePage,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Something went wrong.");
      }
      setSubmitState("success");
      track("follow_submitted", { follow_type: followType, follow_target: followTarget, source_page: sourcePage });
      capture("follow_submitted", { follow_type: followType, follow_target: followTarget, source_page: sourcePage });
    } catch (err) {
      setSubmitState("error");
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong.");
    }
  }

  const formContent = submitState === "success" ? (
    <p className="font-mono text-ui-sm uppercase tracking-label text-signal-positive">
      ✓ Check your inbox to confirm
    </p>
  ) : (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <div className="flex flex-col gap-1.5 flex-1">
        <label htmlFor={inputId} className="sr-only">Email address</label>
        <input
          id={inputId}
          type="email"
          required
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          disabled={submitState === "loading"}
          className="w-full bg-transparent border font-mono text-ui-xl text-text-primary placeholder:text-text-disabled focus-visible:outline-none disabled:opacity-50"
          style={{ borderColor: "var(--border-emphasis)", padding: "0.5rem 0.75rem" }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
        />
        {submitState === "error" && errorMsg && (
          <p className="font-mono text-ui-xs uppercase tracking-label text-signal-negative">
            {errorMsg}
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={submitState === "loading"}
        className="font-mono text-ui-sm uppercase tracking-label disabled:opacity-50 focus-visible:outline-none shrink-0"
        style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", padding: "0.5rem 1rem" }}
      >
        {submitState === "loading" ? "…" : "Follow"}
      </button>
    </form>
  );

  // Desktop table row: two real <td> cells so the form cell sits in the score column.
  // colSpan={5} covers # through Actions; the bare <td> lands in the GF Safety column.
  if (variant === "table") {
    return (
      <>
        <td
          ref={containerRef as unknown as React.RefObject<HTMLTableCellElement>}
          colSpan={5}
          className="py-4 pl-5 pr-6"
          style={{ backgroundColor: "var(--accent-tint-sm)" }}
        >
          <p className="font-mono text-ui-xs uppercase tracking-stamp text-text-disabled mb-1">
            Stay Updated
          </p>
          <p className="font-mono text-ui-sm uppercase tracking-label text-text-label">
            {copy}
          </p>
        </td>
        <td
          className="py-4 align-middle"
          style={{ backgroundColor: "var(--accent-tint-sm)" }}
        >
          {formContent}
        </td>
      </>
    );
  }

  // Mobile card list / non-table inline prompt
  if (variant === "inline") {
    return (
      <div
        ref={containerRef as unknown as React.RefObject<HTMLDivElement>}
        className="flex flex-col gap-3 px-5 py-4"
        style={{ backgroundColor: "var(--accent-tint-sm)", borderBottom: "1px solid var(--border-subtle)" }}
      >
        <div>
          <p className="font-mono text-ui-xs uppercase tracking-stamp text-text-disabled mb-1">
            Stay Updated
          </p>
          <p className="font-mono text-ui-sm uppercase tracking-label text-text-label">
            {copy}
          </p>
        </div>
        {formContent}
      </div>
    );
  }

  // Section variant — below the full table
  return (
    <div
      ref={containerRef as unknown as React.RefObject<HTMLDivElement>}
      className="px-5 py-6 border"
      style={{ backgroundColor: "var(--accent-tint-xs)", borderColor: "var(--accent-tint-xl)" }}
    >
      <p className="font-mono text-ui-xs uppercase tracking-stamp text-text-disabled mb-2">
        Stay Updated
      </p>
      <p className="font-mono text-ui-md uppercase tracking-label text-text-secondary mb-4">
        {copy}
      </p>
      {submitState === "success" ? (
        <p className="font-mono text-ui-md uppercase tracking-label text-signal-positive">
          ✓ Check your inbox to confirm
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2">
          <div className="flex flex-col gap-1.5 flex-1">
            <label htmlFor={inputId} className="sr-only">Email address</label>
            <input
              id={inputId}
              type="email"
              required
              placeholder="your@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={submitState === "loading"}
              className="w-full bg-transparent border font-mono text-ui-xl text-text-primary placeholder:text-text-disabled focus-visible:outline-none disabled:opacity-50"
              style={{ borderColor: "var(--border-emphasis)", padding: "0.75rem 1rem" }}
              onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent)"; }}
              onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-emphasis)"; }}
            />
            {submitState === "error" && errorMsg && (
              <p className="font-mono text-ui-xs uppercase tracking-label text-signal-negative">
                {errorMsg}
              </p>
            )}
          </div>
          <button
            type="submit"
            disabled={submitState === "loading"}
            className="font-mono text-ui-sm uppercase tracking-label disabled:opacity-50 focus-visible:outline-none shrink-0"
            style={{ backgroundColor: "var(--accent)", color: "var(--accent-foreground)", padding: "0.75rem 1.5rem" }}
          >
            {submitState === "loading" ? "…" : "Follow"}
          </button>
        </form>
      )}
    </div>
  );
}
