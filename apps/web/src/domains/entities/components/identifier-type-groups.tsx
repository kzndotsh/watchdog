import { useQuery } from "@tanstack/react-query";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

import { identifierTypeCountsQuery } from "@/domains/entities/identifiers/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { CollapsibleRowTrigger } from "@/shared/ui/collapsible-row-trigger";
import { FetchErrorAlert } from "@/shared/ui/fetch-error-alert";
import { LoadingRegion, TableBodySkeletonLayout } from "@/shared/ui/skeletons";
import type { identifierList } from "@watchdog/schemas/graph";
import {
  IDENTIFIER_TYPE_LABELS,
  LIST_TOTAL_CAP,
  type IdentifierType,
  type ListQuery,
} from "@watchdog/schemas/shared";
import {
  Collapsible,
  CollapsibleContent,
} from "@watchdog/ui/components/collapsible";

/**
 * A group this small starts open; a bigger one (80 domains from a sweep) starts closed, unless it
 * is the only group: then there is nothing else to show, so it opens whatever its size.
 */
const IDENTIFIER_GROUP_OPEN_MAX = 10;

type IdentifierTypeGroupsProps = {
  readonly caseId: string;
  /** The view being grouped (an Entity's Identifiers: `entityId` set), filters and `q` included. */
  readonly query: ListQuery<typeof identifierList>;
  /** A group's rows: rendered only while the group is open, so a closed group reads nothing. */
  readonly renderGroup: (type: IdentifierType) => ReactNode;
};

/**
 * Identifiers grouped by type: one collapsible group per type the view matches, its count from
 * the server (`identifiers.typeCounts`), so a header is right before any of its rows load.
 */
export function IdentifierTypeGroups({
  caseId,
  query,
  renderGroup,
}: IdentifierTypeGroupsProps) {
  const counts = useQuery(identifierTypeCountsQuery(caseId, query));
  if (counts.isError) {
    return (
      <FetchErrorAlert
        error={errMessage(counts.error, couldnt("load", "identifiers"))}
        onRetry={() => {
          void counts.refetch();
        }}
      />
    );
  }
  if (counts.data === undefined) {
    return (
      <LoadingRegion label="Loading identifiers">
        <TableBodySkeletonLayout rows={2} columns={2} />
      </LoadingRegion>
    );
  }
  const groups = counts.data.counts;
  if (groups.length === 0) {
    return <p className="text-muted-foreground text-xs">No identifiers.</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      {/* Keyed by Case and Entity: another Entity's groups start from their own counts, even
          when its counts are cached and never pass through the loading state. */}
      <ul
        key={`${caseId}:${query.filters.entityId ?? ""}`}
        aria-label="Identifiers by type"
        className="divide-border overflow-hidden rounded-lg border"
      >
        {groups.map(({ type, count }) => (
          <li key={type} className="border-border border-b last:border-b-0">
            <Collapsible
              defaultOpen={
                groups.length === 1 || count <= IDENTIFIER_GROUP_OPEN_MAX
              }
            >
              <CollapsibleRowTrigger
                aria-label={`${IDENTIFIER_TYPE_LABELS[type]} (${count})`}
              >
                <ChevronDownIcon
                  className="text-muted-foreground mt-0.5 size-3.5 shrink-0 transition-transform group-aria-expanded/row-trigger:rotate-180"
                  aria-hidden
                />
                <span className="text-foreground text-xs">
                  {IDENTIFIER_TYPE_LABELS[type]}
                </span>
                <span className="text-muted-foreground text-xs tabular-nums">
                  {count}
                </span>
              </CollapsibleRowTrigger>
              <CollapsibleContent>
                <div className="px-3 pb-3">{renderGroup(type)}</div>
              </CollapsibleContent>
            </Collapsible>
          </li>
        ))}
      </ul>
      {counts.data.isCapped ? (
        <p className="text-muted-foreground text-xs">
          Counted over the first {LIST_TOTAL_CAP.toLocaleString()} matching
          identifiers.
        </p>
      ) : null}
    </div>
  );
}
