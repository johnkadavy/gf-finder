"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { createPortal } from "react-dom";
import { capture } from "@/lib/analytics";

const INPUT_CLASS = "font-mono text-ui-md outline-none px-3 py-2.5 border w-full";
const INPUT_STYLE = {
  backgroundColor: "var(--surface-base)",
  borderColor: "var(--border-emphasis)",
  color: "var(--text-secondary)",
} as const;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-ui-xs uppercase tracking-label" style={{ color: "var(--text-dim)" }}>{label}</span>
      {children}
    </label>
  );
}

export function ClaimListing({
  restaurantId,
  googlePlaceId,
  restaurantName,
  neighborhood,
}: {
  restaurantId: number;
  googlePlaceId: string | null;
  restaurantName: string;
  neighborhood?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const raf = window.requestAnimationFrame(() => panelRef.current?.focus());
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); close(); } };
    document.addEventListener("keydown", onKey);
    return () => {
      window.cancelAnimationFrame(raf);
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open, close]);

  const openModal = () => {
    capture("claim_listing_click", { restaurant_id: restaurantId, neighborhood: neighborhood ?? null });
    setError(null);
    setDone(false);
    setOpen(true);
  };

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const fd = new FormData(e.currentTarget);
    if (((fd.get("company") as string) ?? "").trim() !== "") { setDone(true); return; }
    const payload = {
      restaurant_id: restaurantId,
      google_place_id: googlePlaceId,
      name: ((fd.get("name") as string) ?? "").trim(),
      email: ((fd.get("email") as string) ?? "").trim(),
      role: ((fd.get("role") as string) ?? "").trim() || null,
      message: ((fd.get("message") as string) ?? "").trim() || null,
    };
    if (!payload.name || !payload.email) { setError("Please add your name and email."); return; }
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/claims", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(typeof data.error === "string" ? data.error : "Something went wrong.");
      }
      capture("claim_completed", { restaurant_id: restaurantId, neighborhood: neighborhood ?? null });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mb-12">
      <div
        className="flex items-center justify-between gap-5 flex-wrap px-6 py-5 border"
        style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--border-default)" }}
      >
        <div>
          <p className="font-mono text-ui-sm uppercase tracking-label" style={{ color: "var(--text-secondary)" }}>
            Own this restaurant?
          </p>
          <p className="font-mono text-ui-xs" style={{ color: "var(--text-dim)", marginTop: "6px", lineHeight: 1.5 }}>
            Claim your page to keep its gluten-free information accurate.
          </p>
        </div>
        <button
          ref={triggerRef}
          type="button"
          onClick={openModal}
          aria-haspopup="dialog"
          className="font-mono text-ui-sm uppercase tracking-label px-5 py-3 border transition-all inline-flex items-center gap-2 hover:bg-accent-tint-md shrink-0"
          style={{ borderColor: "var(--accent-tint-xl)", color: "var(--accent)", backgroundColor: "var(--accent-tint-sm)" }}
        >
          Claim this listing →
        </button>
      </div>

      {mounted && open && createPortal(
        <div
          onClick={close}
          style={{ position: "fixed", inset: 0, zIndex: 100, backgroundColor: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", padding: "24px", overflowY: "auto" }}
        >
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={`Claim ${restaurantName}`}
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            style={{ width: "min(460px, 100%)", backgroundColor: "var(--surface-overlay)", border: "1px solid var(--border-emphasis)", boxShadow: "0 22px 60px rgba(0,0,0,0.55)", outline: "none" }}
          >
            <div className="font-mono uppercase tracking-label flex items-center justify-between" style={{ fontSize: "12px", color: "var(--text-dim)", padding: "18px 22px", borderBottom: "1px solid var(--border-subtle)" }}>
              <span>Claim this listing</span>
              <button type="button" onClick={close} aria-label="Close" className="transition-colors hover:text-accent" style={{ color: "var(--text-tertiary)", background: "transparent", border: "none", cursor: "pointer", fontSize: "20px", lineHeight: 1, padding: "2px 4px" }}>✕</button>
            </div>

            {done ? (
              <div style={{ padding: "28px 22px" }}>
                <p className="font-[family-name:var(--font-display)]" style={{ fontSize: "22px", letterSpacing: "0.02em", color: "var(--text-primary)" }}>Thanks — we&apos;ll be in touch.</p>
                <p className="font-mono text-ui-md" style={{ color: "var(--text-dim)", marginTop: "10px", lineHeight: 1.6 }}>
                  We&apos;ll review your claim for {restaurantName} and email you to confirm the details.
                </p>
                <button type="button" onClick={close} className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-colors" style={{ borderColor: "var(--accent)", color: "var(--accent)", marginTop: "24px" }}>Done</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ padding: "20px 22px 24px" }} className="flex flex-col gap-4">
                <p className="font-mono text-ui-md" style={{ color: "var(--text-dim)", lineHeight: 1.6 }}>
                  People are finding {restaurantName} on CleanPlate. Claim the page to help make its gluten-free information accurate.
                </p>
                <Field label="Name">
                  <input name="name" required maxLength={120} className={INPUT_CLASS} style={INPUT_STYLE}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")} />
                </Field>
                <Field label="Role (optional)">
                  <input name="role" maxLength={120} placeholder="Owner, manager…" className={INPUT_CLASS} style={INPUT_STYLE}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")} />
                </Field>
                <Field label="Email">
                  <input name="email" type="email" required maxLength={200} className={INPUT_CLASS} style={INPUT_STYLE}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")} />
                </Field>
                <Field label="Anything to add? (optional)">
                  <textarea name="message" maxLength={2000} rows={3} className={INPUT_CLASS} style={{ ...INPUT_STYLE, resize: "vertical" }}
                    onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
                    onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border-emphasis)")} />
                </Field>
                <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: "-9999px", width: "1px", height: "1px", opacity: 0 }} />
                {error && <p className="font-mono text-ui-sm" style={{ color: "var(--signal-negative)" }}>{error}</p>}
                <button type="submit" disabled={submitting} className="font-mono text-ui-sm uppercase tracking-label px-4 py-2.5 border transition-colors disabled:opacity-40 self-start" style={{ borderColor: "var(--accent)", color: "var(--accent)", backgroundColor: "var(--accent-tint-sm)" }}>
                  {submitting ? "Submitting…" : "Submit claim"}
                </button>
              </form>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
