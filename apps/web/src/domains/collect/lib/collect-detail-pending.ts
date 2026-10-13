import type { CollectRow } from "@/domains/collect/types";

/** Detail skeleton — only for job-only rows still fetching job detail. */
export function collectDetailPending(input: {
  selected: CollectRow | null;
  isQueueCorePending: boolean;
  isJobRowDetail: boolean;
  isJobDetailPending: boolean;
}): boolean {
  const { selected, isQueueCorePending, isJobRowDetail, isJobDetailPending } =
    input;

  if (isQueueCorePending) {
    return true;
  }

  if (selected === null) {
    return false;
  }

  if (isJobRowDetail) {
    return isJobDetailPending;
  }

  return false;
}
