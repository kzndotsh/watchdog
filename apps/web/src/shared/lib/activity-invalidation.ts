import type { QueryClient } from "@tanstack/react-query";

import { subscribeActivityStream } from "@/shared/lib/activity-stream";
import {
  invalidateAfterCaseSwitch,
  invalidateAfterEvidenceMutation,
  invalidateAfterFeedEntry,
  invalidateAfterGraphActivity,
  invalidateAfterJobLog,
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
  | "job_log"
  | "evidence"
  | "proposal"
  | "graph"
  | "case"
  | "feed";

const TARGET_OF_KIND = {
  task: "task",
  job: "job",
  playbook_run: "job",
  evidence: "evidence",
  proposal: "proposal",
  entity: "graph",
  edge: "graph",
  claim: "graph",
  identifier: "graph",
  event: "graph",
  question: "graph",
  case: "case",
  handoff: "feed",
} as const satisfies Record<ActivityEntryKind, ActivityTarget>;

/**
 * What an entry refreshes. A saved batch of Job log lines (`job.logged`) refreshes only that
 * Job's detail: no queue, feed or Case-wide Job refetch per batch (#479).
 */
function targetOf(
  entry: Pick<ActivityEntry, "kind" | "action">
): ActivityTarget {
  if (entry.kind === "job" && entry.action === "logged") return "job_log";
  return TARGET_OF_KIND[entry.kind];
}

async function invalidateTarget(
  client: QueryClient,
  target: ActivityTarget,
  caseId: string,
  subjectId: string | null
): Promise<void> {
  switch (target) {
    case "job_log": {
      if (subjectId === null) return invalidateAfterJobMutation(client, caseId);
      return invalidateAfterJobLog(client, caseId, subjectId);
    }
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
    case "feed": {
      // An external AI handoff changes no Graph slice, only the Recent activity feed.
      return invalidateAfterFeedEntry(client);
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
  entry: Pick<ActivityEntry, "kind" | "action" | "caseId" | "subjectId">
): Promise<void> {
  await invalidateTarget(
    client,
    targetOf(entry),
    entry.caseId,
    entry.subjectId
  );
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
  const pending = new Map<
    string,
    { target: ActivityTarget; caseId: string; subjectId: string | null }
  >();
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;
    const batch = [...pending.values()];
    pending.clear();
    for (const { target, caseId, subjectId } of batch) {
      void invalidateTarget(client, target, caseId, subjectId);
    }
  }

  const unsubscribe = subscribeActivityStream({
    onEntry(entry) {
      const target = targetOf(entry);
      // Log batches are per Job: two Jobs' batches are two refreshes.
      const subjectId = target === "job_log" ? entry.subjectId : null;
      pending.set(`${target}:${entry.caseId}:${subjectId ?? ""}`, {
        target,
        caseId: entry.caseId,
        subjectId,
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
