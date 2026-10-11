import { cn } from "@/lib/utils";
import { DossierClaimRowSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-claim-row-skeleton";
import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";
import { TableBodySkeletonLayout } from "@/shared/ui/skeletons/table-body-skeleton-layout";
import { Skeleton } from "@watchdog/ui/components/skeleton";

function DossierTimelineSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: rows }).map((_, index) => (
        <div key={index} className="flex gap-3">
          <Skeleton className="mt-1 size-2 shrink-0 rounded-full" />
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dedicated dossier tab with one primary section (Claims, Identifiers, Events, …). */
export function DossierPanelSkeletonLayout({
  variant = "list",
}: {
  variant?: "list" | "table" | "timeline" | "panel";
}) {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-24">
      {variant === "table" ? (
        <div className="border-border overflow-hidden rounded-md border">
          <div className="border-border bg-muted/30 flex h-8 items-center gap-2 border-b px-3">
            {["w-24", "w-14", "w-14", "w-12", "w-16"].map((width) => (
              <Skeleton key={width} className={cn("h-2.5 shrink-0", width)} />
            ))}
          </div>
          <TableBodySkeletonLayout rows={8} columns={5} />
        </div>
      ) : null}
      {variant === "list" ? (
        <div className="flex flex-col gap-2">
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
        </div>
      ) : null}
      {variant === "timeline" ? <DossierTimelineSkeleton rows={4} /> : null}
      {variant === "panel" ? (
        <div className="border-border flex min-h-[16rem] flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-12">
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-28 rounded-md" />
        </div>
      ) : null}
    </DossierSectionBlockSkeleton>
  );
}
