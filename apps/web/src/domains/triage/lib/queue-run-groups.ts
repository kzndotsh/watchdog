import type { ProposalQueueItem } from "@watchdog/server/core/proposals";

type QueueRun = NonNullable<ProposalQueueItem["playbookRun"]>;

/** A queue entry: one Proposal, or the loaded Proposals of one Playbook run. */
export type QueueEntry =
  | { readonly kind: "proposal"; readonly proposal: ProposalQueueItem }
  | {
      readonly kind: "run";
      /** The run's id and its counts over every status and page (the server's). */
      readonly run: QueueRun;
      readonly playbookId: string | null;
      /** The run's Proposals this view has loaded, in queue order. */
      readonly proposals: readonly ProposalQueueItem[];
    };

/**
 * Folds a Playbook run's Proposals into one entry, at the place of its first (newest) loaded
 * member, keeping the given order. A run that made one Proposal stays a plain row, as does a
 * Proposal from no run. A run with more Proposals than loaded is still one entry, so the next
 * page adds to it rather than starting a second one.
 */
export function groupQueueByRun(
  proposals: readonly ProposalQueueItem[]
): QueueEntry[] {
  const byRun = new Map<string, ProposalQueueItem[]>();
  for (const proposal of proposals) {
    const run = proposal.playbookRun;
    if (run === null) continue;
    const members = byRun.get(run.id);
    if (members === undefined) byRun.set(run.id, [proposal]);
    else members.push(proposal);
  }
  const entries: QueueEntry[] = [];
  const placed = new Set<string>();
  for (const proposal of proposals) {
    const run = proposal.playbookRun;
    if (run === null || run.proposalCount < 2) {
      entries.push({ kind: "proposal", proposal });
      continue;
    }
    if (placed.has(run.id)) continue;
    placed.add(run.id);
    const members = byRun.get(run.id) ?? [proposal];
    entries.push({
      kind: "run",
      run,
      playbookId:
        members.find((p) => p.playbookId !== null)?.playbookId ?? null,
      proposals: members,
    });
  }
  return entries;
}
