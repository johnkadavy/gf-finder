import { SIGNAL_COLORS, SIGNAL_BG, SIGNAL_BORDER } from "@/lib/tokens";
import type { KitchenStatus } from "@/lib/kitchen-status";

const CONFIG: Record<KitchenStatus, { label: string; color: string; bg: string; border: string }> = {
  dedicated:  { label: "Dedicated GF",  color: SIGNAL_COLORS.positive, bg: SIGNAL_BG.positive, border: SIGNAL_BORDER.positive },
  shared:     { label: "Shared",        color: SIGNAL_COLORS.warning,  bg: SIGNAL_BG.warning,  border: SIGNAL_BORDER.warning  },
  unverified: { label: "Unverified",    color: "var(--text-disabled)", bg: "transparent",       border: "var(--border-subtle)" },
};

export function KitchenTag({ status }: { status: KitchenStatus | null }) {
  if (!status) return null;
  const { label, color, bg, border } = CONFIG[status];
  return (
    <span
      className="font-mono text-ui-xs uppercase tracking-label px-2 py-1 border whitespace-nowrap inline-block"
      style={{ color, backgroundColor: bg, borderColor: border }}
    >
      {label}
    </span>
  );
}
