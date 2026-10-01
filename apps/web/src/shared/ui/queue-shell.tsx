import { useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useQueueKeyboard } from "@/shared/lib/queue-keyboard";
import { ScrollArea } from "@watchdog/ui/components/scroll-area";

/**
 * Queue column — sticky header + scroll body (EmptyState can flex-center).
 * Owns queue keyboard flow (j/k anywhere, arrows while focused) unless `keyboard={false}`.
 */
export function QueueShell({
  header,
  children,
  className,
  "aria-label": ariaLabel,
  /** False while skeleton rows fill/overflow the pane — clip instead of a loading-state scrollbar. */
  scrollable = true,
  keyboard = true,
}: {
  header: ReactNode;
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  scrollable?: boolean;
  keyboard?: boolean;
}) {
  const ref = useRef<HTMLElement>(null);
  useQueueKeyboard(ref, keyboard);

  const body = (
    <div className="flex min-h-full flex-col">
      <div className="bg-background sticky top-0 z-20 shrink-0">{header}</div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );

  return (
    <aside
      ref={ref}
      className={cn("flex h-full min-h-0 min-w-0 flex-col", className)}
      aria-label={ariaLabel}
    >
      {scrollable ? (
        <ScrollArea className="min-h-0 flex-1">{body}</ScrollArea>
      ) : (
        <div className="min-h-0 flex-1 overflow-hidden">{body}</div>
      )}
    </aside>
  );
}
