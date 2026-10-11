import { cn } from "@/lib/utils";
import {
  GRAPH_CANVAS_EMBED_SHELL_CLASS,
  GraphCanvasLoadingRegion,
} from "@/shared/ui/graph/graph-canvas-skeleton";
import { DossierClaimRowSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-claim-row-skeleton";
import { DossierConnectionListSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-connection-list-skeleton";
import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";
import { TableBodySkeletonLayout } from "@/shared/ui/skeletons/table-body-skeleton-layout";
import { Skeleton } from "@watchdog/ui/components/skeleton";

/** Dossier Overview tab — Summary, Claims, Identifiers, Connections stack. */
export function DossierOverviewSkeletonLayout() {
  return (
    <div className="flex flex-col gap-6">
      <DossierSectionBlockSkeleton titleWidth="w-16" showAction={false}>
        <Skeleton className="border-border min-h-32 w-full rounded-md border" />
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-14">
        <div className="flex flex-col gap-2">
          <DossierClaimRowSkeleton />
          <DossierClaimRowSkeleton />
        </div>
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-20">
        <div className="border-border overflow-hidden rounded-md border">
          <div className="border-border bg-muted/30 flex h-8 items-center gap-2 border-b px-3">
            {["w-24", "w-14", "w-14", "w-12", "w-16"].map((width) => (
              <Skeleton key={width} className={cn("h-2.5 shrink-0", width)} />
            ))}
          </div>
          <TableBodySkeletonLayout rows={3} columns={5} />
        </div>
      </DossierSectionBlockSkeleton>
      <DossierSectionBlockSkeleton titleWidth="w-24">
        <div className="flex flex-col gap-3">
          <DossierConnectionListSkeleton rows={1} />
          <GraphCanvasLoadingRegion
            label="Loading connections graph"
            shellClassName={GRAPH_CANVAS_EMBED_SHELL_CLASS}
            className="w-full"
          />
        </div>
      </DossierSectionBlockSkeleton>
    </div>
  );
}
