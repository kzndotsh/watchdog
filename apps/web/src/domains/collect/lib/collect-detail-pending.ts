import type { CollectRow } from "@/domains/collect/types";

/** Detail skeleton — only for job-only rows still fetching job detail. */
export function collectDetailPending(input: {
  selected: CollectRow | null;
  queueCorePending: boolean;
  detailIsJobRow: boolean;
  jobDetailPending: boolean;
}): boolean {
  const { selected, queueCorePending, detailIsJobRow, jobDetailPending } =
    input;

  if (queueCorePending) {
    return true;
  }

  if (selected === null) {
    return false;
  }

  if (detailIsJobRow) {
    return jobDetailPending;
  }

  return false;
}
