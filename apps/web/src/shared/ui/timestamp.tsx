import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@watchdog/ui/components/tooltip";

type TooltipSide = ComponentProps<typeof TooltipContent>["side"];

interface TimestampProps {
  /** ISO-8601 instant. */
  value: string | null | undefined;
  /** Visible label (relative / clock / short date). */
  children: ReactNode;
  className?: string;
  side?: TooltipSide;
}

function formatFullLocalDateTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "full",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function isValidIso(value: string | null | undefined): value is string {
  if (!value) return false;
  const d = new Date(value);
  return !Number.isNaN(d.getTime());
}

/**
 * Shows a compact timestamp; hover reveals full local date/time (with zone).
 */
export function Timestamp({
  value,
  children,
  className,
  side = "top",
}: TimestampProps) {
  if (!isValidIso(value)) {
    return <span className={cn("font-light", className)}>{children}</span>;
  }

  const local = formatFullLocalDateTime(value);

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <time
            dateTime={value}
            className={cn("cursor-default font-light tabular-nums", className)}
          />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side}>{local}</TooltipContent>
    </Tooltip>
  );
}

interface WithTooltipProps {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  contentClassName?: string;
  /** Open delay override (ms). Provider default is 500. */
  delay?: number;
  /** Render trigger as a span instead of button (use inside interactive elements) */
  wrapSpan?: boolean;
}

/** Attach a design-system tooltip to any element (replaces native `title=`). */
// oxlint-disable-next-line typescript/promise-function-async -- React 19's `ReactNode` union includes `Promise<AwaitedReactNode>`, so returning `children` widens the inferred return type; this component is always sync
export function WithTooltip({
  content,
  children,
  side = "top",
  className,
  contentClassName,
  delay,
  wrapSpan = false,
}: WithTooltipProps) {
  if (
    content === null ||
    content === undefined ||
    content === false ||
    content === ""
  ) {
    return children;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        className={className}
        delay={delay}
        {...(wrapSpan ? { render: <span /> } : {})}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className={contentClassName}>
        {content}
      </TooltipContent>
    </Tooltip>
  );
}
