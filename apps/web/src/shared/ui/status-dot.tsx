import { cn } from "@/lib/utils";
import { WithTooltip } from "@/shared/ui/timestamp";
import {
  STATUS_GLYPH,
  statusLabel,
  type DisplayStatus,
} from "@/shared/ui/vocab";

interface StatusDotProps {
  status: DisplayStatus;
  /** Spin the glyph for live statuses (running). */
  pulse?: boolean;
  className?: string;
  /** Hide tooltip (parent already labels). */
  tooltip?: boolean;
}

/**
 * 12px lifecycle/status glyph for dense Queue rows. Shape carries the state
 * (see `STATUS_GLYPH`), so rows read without color or hover.
 * Prefer StatusInk in Detail strips; StatusBadge when a table cell needs a chip.
 */
export function StatusDot({
  status,
  pulse = false,
  className,
  tooltip = true,
}: StatusDotProps) {
  const { icon: Icon, color } = STATUS_GLYPH[status];
  const dot = (
    <span
      role="img"
      data-slot="status-dot"
      data-status={status}
      aria-label={statusLabel(status)}
      className={cn(
        "inline-flex size-3 shrink-0 items-center justify-center",
        color,
        pulse && status === "running" && "animate-spin",
        className
      )}
    >
      <Icon aria-hidden className="size-3" strokeWidth={2.25} />
    </span>
  );

  if (!tooltip) return dot;

  return (
    <WithTooltip content={statusLabel(status)} wrapSpan>
      <span className="inline-flex">{dot}</span>
    </WithTooltip>
  );
}
