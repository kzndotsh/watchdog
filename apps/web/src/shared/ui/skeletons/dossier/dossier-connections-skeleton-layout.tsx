import {
  GRAPH_CANVAS_CONNECTIONS_SHELL_CLASS,
  GraphCanvasLoadingRegion,
} from "@/shared/ui/graph/graph-canvas-skeleton";
import { DossierConnectionListSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-connection-list-skeleton";
import { DossierSectionBlockSkeleton } from "@/shared/ui/skeletons/dossier/parts/dossier-section-block-skeleton";

/** Dossier Connections tab — list blocks + ego canvas. */
export function DossierConnectionsSkeletonLayout() {
  return (
    <DossierSectionBlockSkeleton titleWidth="w-24">
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <DossierConnectionListSkeleton rows={2} />
        <GraphCanvasLoadingRegion
          label="Loading connections graph"
          shellClassName={GRAPH_CANVAS_CONNECTIONS_SHELL_CLASS}
        />
      </div>
    </DossierSectionBlockSkeleton>
  );
}
