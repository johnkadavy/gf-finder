import { SIGNAL_COLORS, SIGNAL_BG, SIGNAL_BORDER } from "@/lib/tokens";
import type { KitchenStatus } from "@/lib/kitchen-status";

export function KitchenTag({ status }: { status: KitchenStatus | null }) {
  if (!status) return null;

  const isDedicated = status === "dedicated";
  return (
    <span
      className="font-mono text-ui-xs uppercase tracking-label px-2 py-1 border whitespace-nowrap inline-block"
      style={{
        color:           isDedicated ? SIGNAL_COLORS.positive : SIGNAL_COLORS.warning,
        backgroundColor: isDedicated ? SIGNAL_BG.positive     : SIGNAL_BG.warning,
        borderColor:     isDedicated ? SIGNAL_BORDER.positive  : SIGNAL_BORDER.warning,
      }}
    >
      {isDedicated ? "Dedicated GF" : "Shared, Careful"}
    </span>
  );
}
