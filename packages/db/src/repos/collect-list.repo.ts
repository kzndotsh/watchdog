import { and, arrayOverlaps, desc, eq, inArray, isNull } from "drizzle-orm";

import { collectList } from "@watchdog/schemas/jobs";
import type { CaseId } from "@watchdog/schemas/shared";

import type { DbExec } from "../exec";
import { collectQueue, collectQueueMember } from "../schema/collect-queue";
import { evidence } from "../schema/evidence";
import { jobs } from "../schema/jobs";
import { collectMembers, memberLandedRow } from "./_collect-queue";
import { defineListRepo } from "./_list-query";
import { evidenceColumns } from "./evidence.repo";

/**
 * Collect's queue (`collectList`, ADR-0007), bound to the `collect_queue` projection. Each row
 * carries its member Jobs and its Evidence from the same statement (`collectMembers`, the left
 * join), so a row's state and its Jobs are one snapshot. Every read compares `hidden` by
 * equality, so the btrees lead `(case_id, hidden, key, id)` (`sortLead`).
 */
export const collectListRepo = defineListRepo(collectList, {
  table: collectQueue,
  base: (exec, listKey) =>
    exec
      .select({
        id: collectQueue.id,
        caseId: collectQueue.caseId,
        kind: collectQueue.kind,
        state: collectQueue.state,
        sortAt: collectQueue.sortAt,
        activityAt: collectQueue.activityAt,
        entityId: collectQueue.entityId,
        capabilityIds: collectQueue.capabilityIds,
        members: collectMembers,
        evidence: evidenceColumns,
        listKey,
      })
      .from(collectQueue)
      .leftJoin(evidence, eq(evidence.id, collectQueue.id))
      .$dynamic(),
  id: collectQueue.id,
  scopeColumn: collectQueue.caseId,
  scope: ({ caseId }) => eq(collectQueue.caseId, caseId),
  sortLead: collectQueue.hidden,
  filters: {
    hidden: (isOn) => eq(collectQueue.hidden, isOn),
    state: (states) =>
      states.length > 0 ? inArray(collectQueue.state, [...states]) : undefined,
    kind: (kinds) =>
      kinds.length > 0 ? inArray(collectQueue.kind, [...kinds]) : undefined,
    unprocessed: (isOn) =>
      isOn ? eq(collectQueue.state, "unprocessed") : undefined,
    unattached: (isOn) =>
      isOn
        ? and(eq(collectQueue.kind, "evidence"), isNull(collectQueue.entityId))
        : undefined,
    capability: (ids) =>
      ids.length > 0
        ? arrayOverlaps(collectQueue.capabilityIds, [...ids])
        : undefined,
    entityId: (id) => (id === null ? undefined : eq(collectQueue.entityId, id)),
  },
  // `collect_queue_state_activity_idx (case_id, state, activity_at desc, id desc)` and
  // `collect_queue_entity_activity_idx (case_id, entity_id, ...) WHERE entity_id IS NOT NULL`.
  // `kind`, `unattached` and `capability` scan the activity index and filter: bounded by the Case.
  selective: { state: collectQueue.state, entityId: collectQueue.entityId },
  sorts: { activity: collectQueue.activityAt, started: collectQueue.sortAt },
  searchLabels: { state: collectQueue.state },
  search: { text: collectQueue.searchText },
});

export type CollectListRow = Awaited<
  ReturnType<typeof collectListRepo.page>
>[number];

/** The row `collect.get` found, and the member Job to focus in it (null when the id is the row's own). */
export type CollectLocated = {
  readonly rowId: string;
  readonly focusJobId: string | null;
};

/**
 * Where an id lives in the Case's queue, in the list's mode (`hidden` is the Evidence the user
 * hid: its rows hold no Jobs). The first match of:
 * 1. the id is a row of the mode;
 * 2. the id is a member Job: the row it landed, else the newest by activity, then by id;
 * 3. the id is a run with no row (every step attached): the newest Evidence row holding one of
 *    its Jobs, with that Job in focus.
 * Null when nothing matches. Reads the projection only; the caller reads the row by id.
 */
export async function locateCollectRow(
  exec: DbExec,
  caseId: CaseId,
  id: string,
  isHidden: boolean
): Promise<CollectLocated | null> {
  const inMode = and(
    eq(collectQueue.caseId, caseId),
    eq(collectQueue.hidden, isHidden)
  );
  const [row] = await exec
    .select({ id: collectQueue.id })
    .from(collectQueue)
    .where(and(inMode, eq(collectQueue.id, id)))
    .limit(1);
  if (row !== undefined) return { rowId: row.id, focusJobId: null };

  const [member] = await exec
    .select({ rowId: collectQueueMember.rowId })
    .from(collectQueueMember)
    .innerJoin(collectQueue, eq(collectQueue.id, collectQueueMember.rowId))
    .where(and(inMode, eq(collectQueueMember.jobId, id)))
    .orderBy(
      desc(memberLandedRow),
      desc(collectQueue.activityAt),
      desc(collectQueue.id)
    )
    .limit(1);
  if (member !== undefined) return { rowId: member.rowId, focusJobId: id };

  const [step] = await exec
    .select({ rowId: collectQueueMember.rowId, jobId: jobs.id })
    .from(collectQueueMember)
    .innerJoin(collectQueue, eq(collectQueue.id, collectQueueMember.rowId))
    .innerJoin(jobs, eq(jobs.id, collectQueueMember.jobId))
    .where(
      and(inMode, eq(collectQueue.kind, "evidence"), eq(jobs.playbookRunId, id))
    )
    .orderBy(
      desc(collectQueue.activityAt),
      desc(collectQueue.id),
      jobs.createdAt,
      jobs.id
    )
    .limit(1);
  return step === undefined
    ? null
    : { rowId: step.rowId, focusJobId: step.jobId };
}
