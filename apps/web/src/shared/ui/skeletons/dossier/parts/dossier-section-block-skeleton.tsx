import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import { Skeleton } from "@watchdog/ui/components/skeleton";

type DossierSectionBlockSkeletonProps = {
  titleWidth?: string;
  showAction?: boolean;
  children: ReactNode;
};

/** Dossier section chrome — SectionLabel row + optional ghost action. */
export function DossierSectionBlockSkeleton({
  titleWidth = "w-20",
  showAction = true,
  children,
}: DossierSectionBlockSkeletonProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex h-6 shrink-0 items-center justify-between gap-2">
        <Skeleton className={cn("h-4", titleWidth)} />
        {showAction ? <Skeleton className="size-6 rounded-md" /> : null}
      </div>
      {children}
    </div>
  );
}
