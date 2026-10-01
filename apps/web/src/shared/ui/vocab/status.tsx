import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Chip } from "@/shared/ui/chip";
import {
  STATUS_GLYPH,
  STATUS_LABELS,
  STATUS_TONES,
  type DisplayStatus,
} from "@/shared/ui/vocab/status.lib";

type StatusBadgeProps = Omit<ComponentProps<typeof Chip>, "label" | "tone"> & {
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
    <Chip
      label={STATUS_LABELS[status]}
      tone={STATUS_TONES[status]}
      contrast={contrast}
      className={className}
      size="sm"
      {...props}
    >
      {children}
    </Chip>
  );
}

/** Status as glyph + colored word — no pill. Use in Detail context strips. */
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
  const { icon: Icon, color } = STATUS_GLYPH[status];
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1", className)}>
      <span
        aria-hidden
        className={cn(
          "inline-flex size-3 shrink-0",
          color,
          pulse && status === "running" && "animate-spin"
        )}
      >
        <Icon className="size-3" strokeWidth={2.25} />
      </span>
      <span
        className={cn("truncate", STATUS_TONES[status].low, "bg-transparent")}
      >
        {children ?? STATUS_LABELS[status]}
      </span>
    </span>
  );
}
