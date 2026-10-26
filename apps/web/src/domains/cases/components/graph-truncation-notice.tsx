import { useQuery } from "@tanstack/react-query";

import { graphTruncationNotice } from "@/domains/cases/lib/graph-notice";
import { caseCountsQuery } from "@/domains/cases/queries";
import type { GraphSnapshot } from "@/domains/entities/edges/types";

type GraphTruncationNoticeProps = {
  readonly caseId: string;
  readonly snapshot: GraphSnapshot;
};

/**
 * "Showing 150 of 2,500 entities, the most connected." above a cut Graph (#570). Mounted only when
 * the server says `isTruncated`, so the Case's counts (the "of M") are read only then; its chunk
 * (the counts query and the count copy) stays off the Graph route's bundle.
 */
export function GraphTruncationNotice({
  caseId,
  snapshot,
}: GraphTruncationNoticeProps) {
  const countsQuery = useQuery(caseCountsQuery(caseId));
  const notice = graphTruncationNotice(snapshot, countsQuery.data);
  if (notice === null) return null;
  return (
    <p
      data-slot="graph-truncation-notice"
      className="text-muted-foreground text-xs"
    >
      {notice}
    </p>
  );
}
