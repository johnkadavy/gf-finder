"use client";
import { useState } from "react";

type Segment = { follow_target: string; follow_type: string; count: number };

export function TestDigestForm({ segments }: { segments: Segment[] }) {
  const [selected, setSelected] = useState(segments[0]?.follow_target ?? "");
  const [state, setState] = useState<"idle" | "loading" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedSegment = segments.find((s) => s.follow_target === selected);

  async function handleSend() {
    if (!selectedSegment) return;
    setState("loading");
    setErrorMsg(null);
    const res = await fetch("/api/admin/send-test-digest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        follow_target: selectedSegment.follow_target,
        follow_type: selectedSegment.follow_type,
      }),
    });
    if (res.ok) {
      setState("sent");
    } else {
      const data = await res.json().catch(() => ({}));
      setErrorMsg((data as { error?: string }).error ?? "Something went wrong.");
      setState("error");
    }
  }

  return (
    <div className="py-6 border-b" style={{ borderColor: "var(--border-subtle)" }}>
      <p className="font-mono text-ui-md uppercase tracking-stamp text-text-dim mb-4">
        Digest Preview
      </p>
      {segments.length === 0 ? (
        <p className="font-mono text-ui-sm text-text-disabled">No confirmed follows yet.</p>
      ) : (
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selected}
            onChange={(e) => {
              setSelected(e.target.value);
              setState("idle");
              setErrorMsg(null);
            }}
            className="bg-transparent border font-mono text-ui-sm uppercase tracking-label text-text-label px-3 py-2 focus-visible:outline-none"
            style={{ borderColor: "var(--border-default)" }}
          >
            {segments.map((s) => (
              <option key={s.follow_target} value={s.follow_target}>
                {s.follow_target} · {s.count} follower{s.count !== 1 ? "s" : ""}
              </option>
            ))}
          </select>

          <button
            onClick={handleSend}
            disabled={state === "loading"}
            className="font-mono text-ui-sm uppercase tracking-label px-4 py-2 border transition-colors disabled:opacity-50 hover:border-accent hover:text-accent"
            style={{ borderColor: "var(--border-default)", color: "var(--text-label)" }}
          >
            {state === "loading" ? "Sending…" : "Send Test to My Email"}
          </button>

          {state === "sent" && (
            <span
              className="font-mono text-ui-sm uppercase tracking-label"
              style={{ color: "var(--signal-positive)" }}
            >
              ✓ Check your inbox
            </span>
          )}
          {state === "error" && errorMsg && (
            <span
              className="font-mono text-ui-sm uppercase tracking-label"
              style={{ color: "var(--signal-negative)" }}
            >
              {errorMsg}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
