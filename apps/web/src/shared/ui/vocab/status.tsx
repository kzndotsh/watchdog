import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  STATUS_DOT,
  STATUS_LABELS,
  STATUS_TONES,
  type DisplayStatus,
} from "@/shared/ui/vocab/status.lib";
import { VocabBadge } from "@/shared/ui/vocab/vocab-badge";

type StatusBadgeProps = Omit<
  ComponentProps<typeof VocabBadge>,
  "label" | "tone"
> & {
  status: DisplayStatus;
};

export function StatusBadge({
  status,
  contrast = "low",
  className,
  children,
  ...props
}: StatusBadgeProps) {
  return (
    <VocabBadge
      label={STATUS_LABELS[status]}
      tone={STATUS_TONES[status]}
      contrast={contrast}
      className={className}
      {...props}
    >
      {children}
    </VocabBadge>
  );
}

/** Status as colored type + dot — no pill. Use in Detail context strips. */
export function StatusInk({
  status,
  pulse = false,
  className,
  children,
}: {
  status: DisplayStatus;
  pulse?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span
        aria-hidden
        className={cn(
          "size-2 shrink-0 rounded-full",
          STATUS_DOT[status],
          pulse && status === "running" && "animate-pulse"
        )}
      />
      <span
        className={cn("truncate", STATUS_TONES[status].low, "bg-transparent")}
      >
        {children ?? STATUS_LABELS[status]}
      </span>
    </span>
  );
}
