import type { QueryClient } from "@tanstack/react-query";

import { subscribeActivityStream } from "@/shared/lib/activity-stream";
import {
  invalidateAfterCaseSwitch,
  invalidateAfterEvidenceMutation,
  invalidateAfterGraphActivity,
  invalidateAfterJobMutation,
  invalidateAfterProposalQueueChange,
  invalidateAfterResync,
  invalidateAfterTaskMutation,
} from "@/shared/lib/query-invalidation";
import type { ActivityEntry, ActivityEntryKind } from "@watchdog/schemas/feed";

/** What an entry's kind refreshes: the same function for every Graph kind. */
type ActivityTarget =
  | "task"
  | "job"
  | "evidence"
  | "proposal"
  | "graph"
  | "case";

const TARGET_OF_KIND = {
  task: "task",
  job: "job",
  evidence: "evidence",
  proposal: "proposal",
  entity: "graph",
  edge: "graph",
  claim: "graph",
  identifier: "graph",
  event: "graph",
  question: "graph",
  case: "case",
} as const satisfies Record<ActivityEntryKind, ActivityTarget>;

async function invalidateTarget(
  client: QueryClient,
  target: ActivityTarget,
  caseId: string
): Promise<void> {
  switch (target) {
    case "task": {
      return invalidateAfterTaskMutation(client, caseId);
    }
    case "job": {
      return invalidateAfterJobMutation(client, caseId);
    }
    case "evidence": {
      return invalidateAfterEvidenceMutation(client, caseId);
    }
    case "proposal": {
      return invalidateAfterProposalQueueChange(client, caseId);
    }
    case "graph": {
      return invalidateAfterGraphActivity(client, caseId);
    }
    case "case": {
      // A Case update (rename, egress) refreshes the Case list, the feed's Case
      // names and search: the same slices a Case switch does.
      return invalidateAfterCaseSwitch(client);
    }
    default: {
      const _exhaustive: never = target;
      return _exhaustive;
    }
  }
}

/** The Query invalidation a log entry calls for (ADR-0005 decision 6). */
export async function invalidateForActivity(
  client: QueryClient,
  entry: Pick<ActivityEntry, "kind" | "caseId">
): Promise<void> {
  await invalidateTarget(client, TARGET_OF_KIND[entry.kind], entry.caseId);
}

/**
 * Entries of one target for one Case that arrive within this window run one
 * invalidation (a patch of N ops appends N entries; one refetch is enough).
 */
const COALESCE_MS = 50;

/**
 * Bind the shared activity stream to the Query cache: each entry invalidates
 * the slices it touches, a `resync` invalidates everything. Mounted once for
 * the signed-in app; every Case of the organization arrives on the one
 * connection, so nothing subscribes per Case. Returns the unbind function.
 */
export function bindActivityInvalidation(client: QueryClient): () => void {
  const pending = new Map<string, { target: ActivityTarget; caseId: string }>();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    for (const { target, caseId } of batch) {
      void invalidateTarget(client, target, caseId);
    }
  }

  const unsubscribe = subscribeActivityStream({
    onEntry(entry) {
      const target = TARGET_OF_KIND[entry.kind];
      pending.set(`${target}:${entry.caseId}`, {
        target,
        caseId: entry.caseId,
      });
      timer ??= setTimeout(flush, COALESCE_MS);
    },
    onResync() {
      pending.clear();
      void invalidateAfterResync(client);
    },
  });

  return () => {
    unsubscribe();
    pending.clear();
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
}
