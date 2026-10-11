import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { DetailContextLine } from "@/shared/ui/detail-context-line";

/** First row of split detail — height/border aligned with `QueueHeader`. */
export function DetailContextHeader({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "border-border flex h-10 shrink-0 items-center border-b px-3",
        className
      )}
    >
      <DetailContextLine className="min-w-0 flex-1 flex-nowrap overflow-hidden">
        {children}
      </DetailContextLine>
    </div>
  );
}
