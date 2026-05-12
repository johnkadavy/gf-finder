/**
 * Design system color tokens — JS/TS source of truth.
 * CSS variable equivalents live in app/globals.css.
 * These are the only place hex values for score and signal colors should be defined.
 */

// Score badge colors — each value maps a numeric score range to a hue
export const SCORE_COLORS = {
  excellent:  "#4A7C59",  // ≥85
  great:      "#576A8F",  // 75–84
  good:       "#6B78C5",  // 65–74
  caution:    "#8B7BC5",  // 55–64
  limited:    "#C5A04A",  // 40–54
  risk:       "#FF7444",  // <40 (matches accent)
  noData:     "#9AA5BE",  // null / no data
} as const;

// Signal card colors — muted, designed for use as text and border fills
export const SIGNAL_COLORS = {
  positive: "#7ECF9A",
  warning:  "#D4AE62",
  negative: "#FF8060",
  neutral:  "oklch(0.72 0 0)",
  unknown:  "oklch(0.62 0 0)",
} as const;

export const SIGNAL_BG = {
  positive: "#4A7C590D",
  warning:  "#C5A04A0D",
  negative: "#FF74440D",
  neutral:  "oklch(0.095 0 0)",
  unknown:  "oklch(0.095 0 0)",
} as const;

export const SIGNAL_BORDER = {
  positive: "#4A7C5938",
  warning:  "#C5A04A38",
  negative: "#FF744438",
  neutral:  "oklch(0.18 0 0)",
  unknown:  "oklch(0.18 0 0)",
} as const;

// Homepage signal chip dots — brighter than SIGNAL_COLORS because they render at 6px
export const SIGNAL_DOT = {
  positive: "#4ADE80",
  warning:  "#FACC15",
  error:    "#FF7444",
} as const;

// Primary accent color and pre-computed opacity ramp
export const ACCENT = "#FF7444" as const;
export const ACCENT_TINT = {
  xs: "#FF744408",  // 3%  — ghost hover hint
  sm: "#FF744415",  // 8%  — active filter pill background
  md: "#FF744420",  // 12% — active card background
  lg: "#FF744440",  // 25% — emphasis overlay
  xl: "#FF744460",  // 37% — decorative border / underline
} as const;
