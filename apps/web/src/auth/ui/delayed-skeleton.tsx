import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { SKELETON_DELAY_CLASS } from "@/shared/lib/skeleton-delay";

export type DelayedSkeletonProps = {
  children: ReactNode;
  className?: string;
};

/**
 * Wrap a raw skeleton that is not inside a `LoadingRegion`: it stays mounted, so the space is
 * reserved, but is invisible until `SKELETON_SHOW_DELAY_MS` has passed.
 */
export function DelayedSkeleton({
  children,
  className,
}: DelayedSkeletonProps): ReactNode {
  return <div className={cn(SKELETON_DELAY_CLASS, className)}>{children}</div>;
}
