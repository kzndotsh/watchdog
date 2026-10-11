import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type DetailFooterProps = {
  children?: ReactNode;
  leading?: ReactNode;
  className?: string;
};

/** Sticky-bottom Detail CTA bar — omit when there are no actions. */
export function DetailFooter({
  children,
  leading,
  className,
}: DetailFooterProps) {
  if (children === undefined && leading === undefined) return null;

  return (
    <footer
      data-slot="detail-footer"
      className={cn(
        "border-border bg-background flex shrink-0 flex-wrap items-center gap-2 border-t px-4 py-2",
        leading === undefined ? "justify-end" : "justify-between",
        className
      )}
    >
      {leading === undefined ? null : (
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
          {leading}
        </div>
      )}
      {children === undefined ? null : (
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-1.5">
          {children}
        </div>
      )}
    </footer>
  );
}
