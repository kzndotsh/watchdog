import type { ProposalQueueItem } from "@watchdog/core/proposals";

const MAX_LIST_ROWS = 8;

export function selectRecentProposals(
  proposals: ProposalQueueItem[],
  limit = MAX_LIST_ROWS
): ProposalQueueItem[] {
  return [...proposals]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}
