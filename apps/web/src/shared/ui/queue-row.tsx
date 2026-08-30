import type {
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";
import { formatClockTime } from "@/shared/ui/group-by-day";
import { IdChip } from "@/shared/ui/id-chip";
import { RelativeTime } from "@/shared/ui/relative-time";

type QueueRowProps = {
  selected?: boolean;
  /** Left accent stripe (live/running jobs). */
  live?: boolean;
  leading?: ReactNode;
  trailing?: ReactNode;
  children: ReactNode;
  className?: string;
} & Omit<HTMLAttributes<HTMLDivElement>, "children">;

/**
 * Queue list row hit target — selected / hover / focus chrome.
 * Uses `role="option"` (not `<button>`) so nested controls (copy IdChip) stay valid.
 */
export function QueueRow({
  selected = false,
  live = false,
  leading,
  trailing,
  children,
  className,
  onClick,
  onKeyDown,
  ...props
}: QueueRowProps) {
  function handleActivate(event: MouseEvent<HTMLDivElement>) {
    onClick?.(event);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      event.currentTarget.click();
    }
  }

  return (
    <div
      role="option"
      aria-selected={selected}
      tabIndex={0}
      data-slot="queue-row"
      data-selected={selected || undefined}
      data-live={live || undefined}
      className={cn(
        "relative flex w-full min-w-0 cursor-pointer flex-nowrap items-start gap-2 px-3 py-1.5 text-left transition-colors",
        "hover:bg-muted/50 focus-visible:bg-muted/60 focus-visible:outline-none",
        selected && "bg-muted/70",
        className
      )}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {live ? (
        <span
          aria-hidden
          className="bg-signal absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full"
        />
      ) : null}
      {leading ? (
        <span className="mt-0.5 flex shrink-0 items-center">{leading}</span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">{children}</span>
      {trailing ? (
        <span className="mt-0.5 flex shrink-0 items-center self-start">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

/** Primary line in a QueueRow. */
export function QueueRowTitle({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-foreground truncate font-mono text-xs font-medium",
        className
      )}
    >
      {children}
    </span>
  );
}

/** Secondary muted cluster under the title. */
export function QueueRowMeta({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "text-label-mono-sm text-muted-foreground flex min-w-0 flex-wrap items-center gap-x-1.5",
        className
      )}
    >
      {children}
    </span>
  );
}

/** clock · relative · IdChip (+ optional trailing meta). */
export function QueueRowInstantMeta({
  value,
  id,
  children,
  className,
}: {
  value: string;
  id: string;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <QueueRowMeta className={className}>
      <span className="tabular-nums">{formatClockTime(value)}</span>
      <span aria-hidden>·</span>
      <RelativeTime value={value} />
      <span aria-hidden>·</span>
      <IdChip value={id} copyable className="opacity-80" />
      {children}
    </QueueRowMeta>
  );
}
