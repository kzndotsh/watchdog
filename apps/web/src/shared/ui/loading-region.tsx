import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";

type LoadingRegionProps = {
  label: string;
  className?: string;
  children: ReactNode;
  isBusy?: boolean;
};

/** Accessible busy wrapper — shared by PendingRegion, graph shells, and hand skeletons. */
export function LoadingRegion({
  label,
  className,
  children,
  isBusy = true,
}: LoadingRegionProps): ReactNode {
  if (!isBusy) {
    return className ? <div className={className}>{children}</div> : children;
  }

  return (
    <div className={cn(SKELETON_DELAY_CLASS, className)} aria-busy>
      <span className="sr-only" role="status">
        {label}
      </span>
      <div aria-hidden className="contents">
        {children}
      </div>
    </div>
  );
}
