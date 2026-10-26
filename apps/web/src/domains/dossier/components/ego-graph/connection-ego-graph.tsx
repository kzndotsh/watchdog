import { useQuery } from "@tanstack/react-query";

import { egoTruncationNotice } from "@/domains/cases/lib/graph-notice";
import type {
  EgoEdge,
  EgoEntityRef,
} from "@/domains/dossier/components/ego-graph/edges-to-flow";
import { EgoNeighborhoodCanvas } from "@/domains/dossier/components/ego-graph/ego-neighborhood-canvas";
import { edgeListView, graphEgoQuery } from "@/domains/entities/edges/queries";
import { couldnt } from "@/lib/utils";
import { useListCount } from "@/shared/hooks/list/use-list-count";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { edgeList } from "@watchdog/schemas/graph";

const NO_EGO_EDGES: readonly EgoEdge[] = [];

type ConnectionEgoGraphProps = {
  caseId: string;
  center: EgoEntityRef;
  shouldFillHeight: boolean;
  onEditEdge: (edgeId: string) => void;
};

/**
 * The Dossier ego graph: the server's capped star of the Entity's most recently updated
 * Connections (`graph.ego`), with "Showing 60 of M connections" when it was cut. M is the
 * Connections tab's own count (the default view's first-page total), so the notice adds no read.
 */
export function ConnectionEgoGraph({
  caseId,
  center,
  shouldFillHeight,
  onEditEdge,
}: ConnectionEgoGraphProps) {
  const connectionCount = useListCount(
    edgeListView,
    { caseId },
    edgeList.queryOf({}, { entityId: center.id })
  );
  const egoQuery = useQuery(graphEgoQuery(caseId, center.id));
  const notice =
    egoQuery.data === undefined
      ? null
      : egoTruncationNotice(egoQuery.data, connectionCount.total);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      {notice === null ? null : (
        <p
          data-slot="ego-truncation-notice"
          className="text-muted-foreground text-xs"
        >
          {notice}
        </p>
      )}
      {egoQuery.isError ? (
        <FetchErrorAlert
          error={couldnt("load", "the connection graph")}
          onRetry={() => {
            void egoQuery.refetch();
          }}
        />
      ) : (
        <EgoNeighborhoodCanvas
          center={center}
          edges={egoQuery.data?.edges ?? NO_EGO_EDGES}
          shouldFillHeight={shouldFillHeight}
          onEditEdge={onEditEdge}
        />
      )}
    </div>
  );
}
