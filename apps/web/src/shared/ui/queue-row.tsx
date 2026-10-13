import type {
  HTMLAttributes,
  KeyboardEvent,
  MouseEvent,
  ReactNode,
} from "react";

import { cn } from "@/lib/utils";

type QueueRowProps = {
  isSelected?: boolean;
  /** Left state bar in the running hue (live jobs). Selection is the amber wash. */
  isLive?: boolean;
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
  isSelected = false,
  isLive = false,
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
      aria-selected={isSelected}
      tabIndex={0}
      data-slot="queue-row"
      data-selected={isSelected || undefined}
      data-live={isLive || undefined}
      className={cn(
        "relative flex w-full min-w-0 cursor-pointer flex-nowrap items-start gap-2 px-3 py-1.5 text-left transition-colors duration-(--duration-fast)",
        "hover:bg-muted/40 focus-visible:bg-muted/50 focus-visible:outline-none",
        isSelected &&
          "bg-signal/10 hover:bg-signal/15 focus-visible:bg-signal/15",
        className
      )}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      {...props}
    >
      {isLive ? (
        <span
          aria-hidden
          className="bg-status-running absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full"
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
