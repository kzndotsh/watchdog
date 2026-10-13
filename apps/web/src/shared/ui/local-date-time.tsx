import type { ComponentProps } from "react";

import { Timestamp } from "@/shared/ui/timestamp";

type TooltipSide = ComponentProps<typeof Timestamp>["side"];

function formatShortLocal(iso: string, isDateOnly: boolean): string {
  try {
    const d = new Date(iso);
    return isDateOnly ? d.toLocaleDateString() : d.toLocaleString();
  } catch {
    return iso;
  }
}

type LocalDateTimeProps = {
  value: string | null | undefined;
  className?: string;
  side?: TooltipSide;
  /** Calendar day only (e.g. task due dates). */
  isDateOnly?: boolean;
};

/**
 * Visible short local datetime; hover shows full local via Timestamp.
 */
export function LocalDateTime({
  value,
  className,
  side,
  isDateOnly = false,
}: LocalDateTimeProps) {
  if (!value) {
    return <span className={className}>—</span>;
  }

  return (
    <Timestamp value={value} className={className} side={side}>
      {formatShortLocal(value, isDateOnly)}
    </Timestamp>
  );
}
