type Confidence = "high" | "medium" | "low";

export function ConfidenceDots({
  confidence,
}: {
  confidence: Confidence | null | undefined;
}) {
  const filled =
    confidence === "high" ? 3 : confidence === "medium" ? 2 : confidence === "low" ? 1 : 0;
  const label = confidence
    ? confidence.charAt(0).toUpperCase() + confidence.slice(1)
    : "—";

  return (
    <div
      className="flex items-center gap-1.5 font-mono text-ui-sm uppercase tracking-label"
      style={{ color: "var(--text-dim)" }}
    >
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-full"
            style={{
              backgroundColor:
                i < filled ? "var(--signal-positive)" : "var(--border-default)",
            }}
          />
        ))}
      </span>
      {label}
    </div>
  );
}
