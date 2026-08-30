import type { ReactNode } from "react";

import { LoadingRegion } from "@/shared/ui/loading-region";

export interface PendingRegionProps {
  loading: boolean;
  label: string;
  children: ReactNode;
  fallback: ReactNode;
  className?: string;
}

/** Gate a data slot: live children when ready, hand skeleton when pending. Not for `DataTable` (use `pending`). */
export function PendingRegion({
  loading,
  label,
  children,
  fallback,
  className,
}: PendingRegionProps): ReactNode {
  if (!loading) {
    return className ? <div className={className}>{children}</div> : children;
  }

  return (
    <LoadingRegion label={label} className={className}>
      {fallback}
    </LoadingRegion>
  );
}
