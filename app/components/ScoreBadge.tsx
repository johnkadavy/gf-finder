import { getGaugeColor, getScoreLabel } from "@/lib/score";

type Props = {
  score: number | null;
  size?: "sm" | "md";
  showBar?: boolean;
};

const sizes = {
  md: { numFontSize: "clamp(1.5rem, 3.5vw, 2.75rem)", labelClass: "text-ui-sm" },
  sm: { numFontSize: "clamp(1.25rem, 3vw, 2.25rem)",  labelClass: "text-ui-xs" },
};

export function ScoreBadge({ score, size = "md", showBar = false }: Props) {
  const color = getGaugeColor(score);
  const { label } = getScoreLabel(score);
  const { numFontSize, labelClass } = sizes[size];

  return (
    <div className="flex flex-col items-end shrink-0 pt-0.5">
      <span
        className="font-[family-name:var(--font-display)] leading-none tabular-nums"
        style={{ fontSize: numFontSize, color }}
      >
        {score !== null ? Math.round(score) : "—"}
      </span>
      <span
        className={`hidden md:block font-mono ${labelClass} uppercase tracking-label mt-1 text-right`}
        style={{ color: `${color}cc` }}
      >
        {label}
      </span>
      {showBar && score !== null && (
        <div
          className="mt-2 w-10 relative"
          style={{ height: "3px", backgroundColor: "var(--border-subtle)" }}
        >
          <div
            className="absolute inset-y-0 left-0"
            style={{ width: `${score}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}
