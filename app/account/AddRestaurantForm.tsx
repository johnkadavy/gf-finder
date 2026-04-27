"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";

type StepStatus = "idle" | "running" | "done" | "error" | "duplicate" | "timeout";

interface Step {
  key: string;
  label: string;
  status: StepStatus;
  detail?: string;
}

const INITIAL_STEPS: Step[] = [
  { key: "parse_url",     label: "Parse URL",            status: "idle" },
  { key: "check_db",      label: "Check database",       status: "idle" },
  { key: "google_places", label: "Fetch from Google",    status: "idle" },
  { key: "supabase",      label: "Save to Supabase",     status: "idle" },
  { key: "airtable",      label: "Add to Airtable",      status: "idle" },
  { key: "enrichment",    label: "Wait for enrichment",  status: "idle" },
  { key: "sync",          label: "Sync to Supabase",     status: "idle" },
];

export function AddRestaurantForm() {
  const [url, setUrl]               = useState("");
  const [city, setCity]             = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [steps, setSteps]           = useState<Step[]>(INITIAL_STEPS);
  const [running, setRunning]       = useState(false);
  const [result, setResult]         = useState<{ name: string; id: number; score: number | null } | null>(null);
  const [fatalError, setFatalError] = useState<string | null>(null);
  const [timedOutPlaceId, setTimedOutPlaceId] = useState<string | null>(null);
  const [retrying, setRetrying]     = useState(false);
  const [retryResult, setRetryResult] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const autoPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [autoPollAttempt, setAutoPollAttempt] = useState(0);

  function updateStep(key: string, patch: Partial<Step>) {
    setSteps((prev) => prev.map((s) => (s.key === key ? { ...s, ...patch } : s)));
  }

  // Auto-poll Airtable after enrichment timeout — checks every 30s, gives up after 20 attempts (~10 min)
  const enrichmentTimedOut = steps.find((s) => s.key === "enrichment")?.status === "timeout";

  useEffect(() => {
    if (!enrichmentTimedOut || !timedOutPlaceId) return;
    if (autoPollRef.current) return; // already polling

    let attempts = 0;
    autoPollRef.current = setInterval(async () => {
      attempts++;
      setAutoPollAttempt(attempts);
      if (attempts > 20) {
        clearInterval(autoPollRef.current!);
        autoPollRef.current = null;
        return;
      }
      try {
        const res = await fetch("/api/admin/sync-restaurant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ placeId: timedOutPlaceId }),
        });
        const data = await res.json();
        if (data.status === "synced") {
          clearInterval(autoPollRef.current!);
          autoPollRef.current = null;
          updateStep("enrichment", { status: "done", detail: "Ready" });
          updateStep("sync", {
            status: "done",
            detail: data.score != null ? `Score: ${Math.round(data.score)}` : undefined,
          });
        }
      } catch { /* ignore transient errors */ }
    }, 30_000);

    return () => {
      if (autoPollRef.current) {
        clearInterval(autoPollRef.current);
        autoPollRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrichmentTimedOut, timedOutPlaceId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim() || running) return;

    // Reset state
    setSteps(INITIAL_STEPS);
    setResult(null);
    setFatalError(null);
    setTimedOutPlaceId(null);
    setRetryResult(null);
    setAutoPollAttempt(0);
    if (autoPollRef.current) {
      clearInterval(autoPollRef.current);
      autoPollRef.current = null;
    }
    setRunning(true);

    const abort = new AbortController();
    abortRef.current = abort;

    try {
      const res = await fetch("/api/admin/add-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim(), city: city.trim(), neighborhood: neighborhood.trim() }),
        signal: abort.signal,
      });

      if (!res.ok || !res.body) {
        setFatalError(`Request failed (${res.status})`);
        setRunning(false);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let event: any;
          try { event = JSON.parse(line); } catch { continue; }

          switch (event.step) {
            case "parse_url":
              if (event.status === "running") updateStep("parse_url", { status: "running" });
              if (event.status === "done") {
                updateStep("parse_url", { status: "done", detail: event.placeId });
                setTimedOutPlaceId(event.placeId); // keep for retry if enrichment times out
              }
              if (event.status === "error") updateStep("parse_url", { status: "error", detail: event.message });
              break;

            case "check_db":
              if (event.status === "running") updateStep("check_db", { status: "running" });
              if (event.status === "done") updateStep("check_db", { status: "done", detail: "Not in database" });
              if (event.status === "duplicate") {
                updateStep("check_db", { status: "duplicate", detail: `Already exists: ${event.name}` });
              }
              break;

            case "google_places":
              if (event.status === "running") updateStep("google_places", { status: "running" });
              if (event.status === "done") updateStep("google_places", { status: "done", detail: event.name });
              if (event.status === "error") updateStep("google_places", { status: "error", detail: event.message });
              break;

            case "supabase":
              if (event.status === "running") updateStep("supabase", { status: "running" });
              if (event.status === "done") updateStep("supabase", { status: "done" });
              if (event.status === "error") updateStep("supabase", { status: "error", detail: event.message });
              break;

            case "airtable":
              if (event.status === "running") updateStep("airtable", { status: "running" });
              if (event.status === "done") updateStep("airtable", { status: "done", detail: event.alreadyExisted ? "Already in Airtable" : "Created" });
              if (event.status === "error") updateStep("airtable", { status: "error", detail: event.message });
              break;

            case "enrichment":
              if (event.status === "pending") updateStep("enrichment", { status: "running", detail: `Attempt ${event.attempt}/${event.max}…` });
              if (event.status === "done") updateStep("enrichment", { status: "done", detail: `Ready after attempt ${event.attempt}` });
              if (event.status === "timeout") updateStep("enrichment", { status: "timeout", detail: "Timed out — use Retry Sync below" });
              break;

            case "sync":
              if (event.status === "running") updateStep("sync", { status: "running" });
              if (event.status === "done") updateStep("sync", { status: "done", detail: event.score != null ? `Score: ${Math.round(event.score)}` : undefined });
              if (event.status === "error") updateStep("sync", { status: "error", detail: event.message });
              break;

            case "complete":
              setResult({ name: event.name, id: event.id, score: event.score ?? null });
              break;

            case "error":
              setFatalError(event.message);
              break;
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setFatalError((err as Error).message);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
    }
  }

  function handleCancel() {
    abortRef.current?.abort();
    setRunning(false);
  }

  async function handleRetrySync() {
    if (!timedOutPlaceId || retrying) return;
    setRetrying(true);
    setRetryResult(null);
    try {
      const res = await fetch("/api/admin/sync-restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: timedOutPlaceId }),
      });
      const data = await res.json();
      if (data.status === "synced") {
        setRetryResult(`Synced${data.score != null ? ` — Score: ${Math.round(data.score)}` : ""}`);
        updateStep("enrichment", { status: "done", detail: "Ready (retry)" });
        updateStep("sync", { status: "done", detail: data.score != null ? `Score: ${Math.round(data.score)}` : undefined });
      } else if (data.status === "not_ready") {
        setRetryResult("Still not ready — try again in a moment.");
      } else if (data.status === "not_found") {
        setRetryResult("Record not found in Airtable.");
      } else {
        setRetryResult(data.message ?? "Unknown error.");
      }
    } catch {
      setRetryResult("Request failed.");
    } finally {
      setRetrying(false);
    }
  }

  const anyStarted = steps.some((s) => s.status !== "idle");

  return (
    <div className="py-6 border-b" style={{ borderColor: "oklch(0.18 0 0)" }}>
      <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-[oklch(0.55_0_0)] mb-5">
        Add Restaurant
      </p>

      <form onSubmit={handleSubmit} className="space-y-3">
        {/* URL input */}
        <div>
          <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)] block mb-1.5">
            Google Maps URL
          </label>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://maps.app.goo.gl/… or paste from desktop"
            disabled={running}
            required
            className="w-full font-mono text-[13px] px-3 py-2 border bg-transparent outline-none disabled:opacity-40"
            style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.85 0 0)" }}
          />
        </div>

        {/* City + Neighborhood */}
        <div className="flex gap-3">
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)] block mb-1.5">
              City
            </label>
            <input
              type="text"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="New York"
              disabled={running}
              className="w-full font-mono text-[13px] px-3 py-2 border bg-transparent outline-none disabled:opacity-40"
              style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.85 0 0)" }}
            />
          </div>
          <div className="flex-1">
            <label className="font-mono text-[10px] uppercase tracking-[0.2em] text-[oklch(0.4_0_0)] block mb-1.5">
              Neighborhood
            </label>
            <input
              type="text"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="West Village (required)"
              disabled={running}
              className="w-full font-mono text-[13px] px-3 py-2 border bg-transparent outline-none disabled:opacity-40"
              style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.85 0 0)" }}
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={running || !url.trim()}
            className="font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2 border transition-colors duration-150 disabled:opacity-40"
            style={{ borderColor: "oklch(0.45 0 0)", color: "oklch(0.85 0 0)", backgroundColor: "oklch(0.13 0 0)" }}
          >
            {running ? "Running…" : "Add Restaurant"}
          </button>
          {running && (
            <button
              type="button"
              onClick={handleCancel}
              className="font-mono text-[11px] uppercase tracking-[0.2em] px-4 py-2 border transition-colors duration-150"
              style={{ borderColor: "oklch(0.28 0 0)", color: "oklch(0.5 0 0)" }}
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {/* Progress steps */}
      {anyStarted && (
        <div className="mt-5 space-y-1.5">
          {steps.map((step) => {
            if (step.status === "idle") return null;
            return (
              <div key={step.key} className="flex items-start gap-2.5">
                <StepIcon status={step.status} />
                <div>
                  <span className="font-mono text-[11px] text-[oklch(0.72 0 0)]">{step.label}</span>
                  {step.detail && (
                    <span className="font-mono text-[11px] text-[oklch(0.45 0 0)] ml-2">{step.detail}</span>
                  )}
                </div>
              </div>
            );
          })}

          {/* Duplicate notice */}
          {steps.find((s) => s.key === "check_db" && s.status === "duplicate") && (
            <p className="font-mono text-[11px] text-[oklch(0.55_0_0)] pt-1">
              This restaurant is already in the database.
            </p>
          )}

          {/* Timeout — auto-polls in background, manual retry also available */}
          {steps.find((s) => s.key === "enrichment" && s.status === "timeout") && (
            <div className="pt-2 space-y-2">
              <p className="font-mono text-[11px] text-[oklch(0.5_0_0)]">
                {autoPollAttempt > 0
                  ? `Enrichment in progress — auto-check ${autoPollAttempt}/20…`
                  : "Enrichment in progress — checking automatically every 30s."}
              </p>
              <div className="flex items-center gap-3 flex-wrap">
                <button
                  type="button"
                  onClick={handleRetrySync}
                  disabled={retrying}
                  className="font-mono text-[11px] uppercase tracking-[0.15em] px-3 py-1.5 border transition-colors disabled:opacity-40"
                  style={{ borderColor: "oklch(0.35 0 0)", color: "oklch(0.75 0 0)" }}
                >
                  {retrying ? "Checking…" : "Check Now"}
                </button>
                {retryResult && (
                  <span className="font-mono text-[11px]" style={{ color: retryResult.startsWith("Synced") ? "#7ECF9A" : "oklch(0.55 0 0)" }}>
                    {retryResult}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Fatal error */}
          {fatalError && (
            <p className="font-mono text-[11px] pt-1" style={{ color: "#FF8060" }}>
              Error: {fatalError}
            </p>
          )}

          {/* Success */}
          {result && (
            <div className="pt-2 flex items-center gap-3">
              <span className="font-mono text-[11px]" style={{ color: "#7ECF9A" }}>
                ✓ {result.name} added
                {result.score != null && ` — Score: ${Math.round(result.score)}`}
              </span>
              <Link
                href={`/restaurant/${result.id}`}
                className="font-mono text-[10px] uppercase tracking-[0.15em] text-[#FF7444] hover:underline"
              >
                View →
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StepIcon({ status }: { status: StepStatus }) {
  if (status === "running") {
    return (
      <span className="font-mono text-[11px] mt-px w-4 shrink-0 animate-pulse" style={{ color: "oklch(0.65 0 0)" }}>
        ·
      </span>
    );
  }
  if (status === "done") {
    return <span className="font-mono text-[11px] mt-px w-4 shrink-0" style={{ color: "#7ECF9A" }}>✓</span>;
  }
  if (status === "duplicate") {
    return <span className="font-mono text-[11px] mt-px w-4 shrink-0" style={{ color: "#D4AE62" }}>~</span>;
  }
  if (status === "timeout") {
    return <span className="font-mono text-[11px] mt-px w-4 shrink-0" style={{ color: "#D4AE62" }}>!</span>;
  }
  if (status === "error") {
    return <span className="font-mono text-[11px] mt-px w-4 shrink-0" style={{ color: "#FF8060" }}>✗</span>;
  }
  return null;
}
