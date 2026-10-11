import type { ComponentProps, ReactNode } from "react";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@watchdog/ui/components/tooltip";

type TooltipSide = ComponentProps<typeof TooltipContent>["side"];

type WithTooltipProps = {
  content: ReactNode;
  children: ReactNode;
  side?: TooltipSide;
  className?: string;
  contentClassName?: string;
  /** Open delay override (ms). Provider default is 500. */
  delay?: number;
  /** Render trigger as a span instead of button (use inside interactive elements) */
  wrapSpan?: boolean;
};

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
