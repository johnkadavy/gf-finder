"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase-browser";

type Props = {
  restaurantId: number;
  googlePlaceId: string;
};

type OptionGroup<T extends string> = {
  label: string;
  field: string;
  options: { value: T; label: string }[];
};

const FIELDS: OptionGroup<string>[] = [
  {
    label: "Overall",
    field: "overall_sentiment",
    options: [
      { value: "mostly_positive", label: "Positive" },
      { value: "mixed",           label: "Mixed" },
      { value: "mostly_negative", label: "Negative" },
    ],
  },
  {
    label: "Staff Knowledge",
    field: "staff_knowledge",
    options: [
      { value: "high",   label: "High" },
      { value: "medium", label: "Medium" },
      { value: "low",    label: "Low" },
    ],
  },
  {
    label: "GF Labeling",
    field: "gf_labeling",
    options: [
      { value: "clear",   label: "Clear" },
      { value: "partial", label: "Partial" },
      { value: "none",    label: "None" },
    ],
  },
  {
    label: "GF Options",
    field: "gf_options_level",
    options: [
      { value: "many",     label: "Many" },
      { value: "moderate", label: "Some" },
      { value: "few",      label: "Few" },
      { value: "none",     label: "None" },
    ],
  },
  {
    label: "Cross-Contamination Risk",
    field: "cross_contamination_risk",
    options: [
      { value: "low",    label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high",   label: "High" },
    ],
  },
  {
    label: "Dedicated GF Fryer",
    field: "dedicated_fryer",
    options: [
      { value: "yes", label: "Yes" },
      { value: "no",  label: "No" },
    ],
  },
];

export function ReviewForm({ restaurantId, googlePlaceId }: Props) {
  const [isReviewer, setIsReviewer] = useState(false);
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [visitDate, setVisitDate] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("is_verified_reviewer")
        .eq("user_id", user.id)
        .single();
      if (data?.is_verified_reviewer) setIsReviewer(true);
    });
  }, []);

  if (!isReviewer) return null;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          restaurant_id: restaurantId,
          google_place_id: googlePlaceId,
          visit_date: visitDate || null,
          notes: notes || null,
          ...values,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Something went wrong");
      } else {
        setSubmitted(true);
      }
    } catch {
      setError("Network error — try again");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div
        className="border p-5 text-center"
        style={{ borderColor: "#4A7C5930", backgroundColor: "#4A7C5908" }}
      >
        <p className="font-mono text-ui-md uppercase tracking-editorial" style={{ color: "#4A7C59" }}>
          Review submitted ✓
        </p>
      </div>
    );
  }

  return (
    <div>
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full border py-3.5 font-mono text-ui-md uppercase tracking-editorial transition-colors hover:text-white"
          style={{ borderColor: "var(--border-default)", color: "var(--text-dim)" }}
        >
          + Add Verified Review
        </button>
      ) : (
        <div
          className="border p-5 space-y-5"
          style={{ borderColor: "var(--border-default)", backgroundColor: "var(--surface-raised)" }}
        >
          <p className="font-mono text-ui-sm uppercase tracking-stamp text-text-dim">
            Verified Review
          </p>

          {/* Button group fields */}
          {FIELDS.map((field) => (
            <div key={field.field}>
              <p className="font-mono text-ui-sm uppercase tracking-editorial text-text-disabled mb-2">
                {field.label}
              </p>
              <div className="flex flex-wrap gap-2">
                {field.options.map((opt) => {
                  const active = values[field.field] === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() =>
                        setValues((v) =>
                          active
                            ? Object.fromEntries(Object.entries(v).filter(([k]) => k !== field.field))
                            : { ...v, [field.field]: opt.value }
                        )
                      }
                      className="px-4 py-2.5 font-mono text-ui-md uppercase tracking-label border transition-colors min-w-[64px]"
                      style={{
                        borderColor: active ? "var(--accent)" : "var(--border-emphasis)",
                        backgroundColor: active ? "var(--accent-tint-md)" : "transparent",
                        color: active ? "var(--accent)" : "var(--text-label)",
                      }}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {/* Visit date */}
          <div>
            <p className="font-mono text-ui-sm uppercase tracking-editorial text-text-disabled mb-2">
              Visit Date
            </p>
            <input
              type="date"
              value={visitDate}
              onChange={(e) => setVisitDate(e.target.value)}
              className="bg-transparent border font-mono text-[12px] px-3 py-2.5 outline-none w-full md:w-auto"
              style={{ borderColor: "var(--border-emphasis)", color: "var(--text-tertiary)", colorScheme: "dark" }}
            />
          </div>

          {/* Notes */}
          <div>
            <p className="font-mono text-ui-sm uppercase tracking-editorial text-text-disabled mb-2">
              Notes <span className="normal-case tracking-normal opacity-50">(optional)</span>
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything else worth noting…"
              rows={3}
              className="w-full bg-transparent border font-mono text-[12px] px-3 py-2.5 outline-none resize-none placeholder:opacity-30"
              style={{ borderColor: "var(--border-emphasis)", color: "var(--text-secondary)" }}
            />
          </div>

          {error && (
            <p className="font-mono text-ui-sm uppercase tracking-label text-accent">
              {error}
            </p>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 py-3 font-mono text-ui-md uppercase tracking-editorial bg-white text-black hover:bg-[oklch(0.85_0_0)] disabled:opacity-40 transition-colors"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
            <button
              onClick={() => setOpen(false)}
              className="px-5 py-3 font-mono text-ui-md uppercase tracking-editorial border transition-colors"
              style={{ borderColor: "var(--border-default)", color: "var(--text-disabled)" }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
