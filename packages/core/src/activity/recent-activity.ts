import { Effect } from "effect";

import {
  activityLogRepo,
  activityRepo,
  type RecentActivityLogRow,
} from "@watchdog/db";
import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import type { ActivityItem } from "@watchdog/schemas/feed";
import type { CaseId, OrganizationId } from "@watchdog/schemas/shared";
import { parseTrimmedCaseId } from "@watchdog/schemas/shared";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { loadEntityDisplayMapsForProposalPatchesEffect } from "../entities/entity-display";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { tryDbWith } from "../infra/postgres-effect";
import type { DomainTag } from "../infra/tagged-errors";
import { proposalActivityLabel } from "../proposals/proposal-display";
import { mapJobFeedRowsEffect } from "./job-feed";

export interface ListRecentActivityOpts {
  organizationId: OrganizationId;
  caseId?: CaseId;
  limit?: number;
}

const DEFAULT_LIMIT = 15;
const PER_SOURCE_FETCH_CAP = 100;

function clampActivityLimit(value: number | undefined): number {
  const n = value ?? DEFAULT_LIMIT;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(n)), PER_SOURCE_FETCH_CAP);
}

function perSourceFetchLimit(limit: number): number {
  return Math.min(Math.max(limit * 4, limit), PER_SOURCE_FETCH_CAP);
}

export { clampActivityLimit, perSourceFetchLimit };

/**
 * The `(kind, action)` pairs of the activity log the workspace feed shows
 * (ADR-0005 decision 5). Task edits that keep the status and reorders are in
 * the log (they notify) but not in the feed, as before.
 */
export const FEED_ACTIONS = {
  task: ["created", "status_changed", "deleted"],
  job: ["queued", "running", "succeeded", "failed", "cancelled"],
} as const;

/** Map stored task event codes → display verb. */
export function taskEventAction(
  action: string,
  toValue: string | null
): string {
  if (action === "created") return "Created";
  if (action === "deleted") return "Deleted";
  if (action === "status_changed") {
    if (toValue === "done") return "Completed";
    if (toValue === "dropped") return "Dropped";
    return "Moved";
  }
  return "Updated";
}

function mapTaskEvent(
  row: RecentActivityLogRow,
  users: ReadonlyMap<string, { name: string; email: string }>
): ActivityItem {
  return {
    id: String(row.id),
    kind: "task",
    action: taskEventAction(row.action, row.toValue),
    caseId: row.caseId,
    caseName: row.caseName,
    label: row.label ?? "",
    status: row.toValue ?? undefined,
    fromStatus: row.fromValue ?? undefined,
    toStatus: row.toValue ?? undefined,
    at: row.at.toISOString(),
    actor: row.actorId ? labelForActor(row.actorId, users) : undefined,
  };
}

/** Pure merge/sort for unit tests — newer `at` first. */
export function mergeActivityItems(
  items: ActivityItem[],
  limit: number
): ActivityItem[] {
  return [...items]
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, limit);
}

export function listRecentActivityEffect(
  opts: ListRecentActivityOpts
): Effect.Effect<ActivityItem[], DomainTag, Db> {
  const limit = clampActivityLimit(opts.limit);
  const fetchLimit = perSourceFetchLimit(limit);
  const scopedCaseFilter =
    opts.caseId === undefined ? undefined : parseTrimmedCaseId(opts.caseId);
  if (scopedCaseFilter === null) {
    return Effect.succeed([]);
  }

  return Effect.gen(function* listRecentActivityGen() {
    const scopedCaseId =
      scopedCaseFilter === undefined
        ? undefined
        : yield* assertCaseInOrgEffect(scopedCaseFilter, opts.organizationId);
    const repoOpts = {
      organizationId: opts.organizationId,
      caseId: scopedCaseId,
      limit: fetchLimit,
    };
    const [evidenceRows, jobRows, proposalRows, taskEvents] = yield* Effect.all(
      [
        tryDbWith((exec) => activityRepo.recentEvidence(exec, repoOpts)),
        tryDbWith((exec) =>
          activityLogRepo.recentCollapsed(exec, {
            ...repoOpts,
            kind: "job",
            actions: FEED_ACTIONS.job,
          })
        ),
        tryDbWith((exec) =>
          activityRepo.recentPendingProposals(exec, repoOpts)
        ),
        tryDbWith((exec) =>
          activityLogRepo.recent(exec, {
            ...repoOpts,
            kind: "task",
            actions: FEED_ACTIONS.task,
          })
        ),
      ],
      { concurrency: "unbounded" }
    );

    const users = yield* loadActorUsersEffect([
      ...evidenceRows.map((row) => row.actorId),
      ...jobRows.map((row) => row.actorId),
      ...taskEvents.map((row) => row.actorId),
    ]);
    const jobItems = yield* mapJobFeedRowsEffect(jobRows, users);

    const {
      entityNames: proposalEntityNames,
      entitySlugs: proposalEntitySlugs,
    } = yield* loadEntityDisplayMapsForProposalPatchesEffect(
      proposalRows.map((row) => ({
        caseId: row.caseId,
        patch: row.patch,
      }))
    );

    const items: ActivityItem[] = [
      ...evidenceRows.map((row) => ({
        id: row.id,
        kind: "evidence" as const,
        action: "Captured",
        caseId: row.caseId,
        caseName: row.caseName,
        label: evidenceDisplayLabel({
          label: row.label,
          kind: row.kind,
          sourceUrl: row.sourceUrl,
        }),
        at: row.at.toISOString(),
        actor: labelForActor(row.actorId, users, row.actorLabel),
      })),
      ...jobItems,
      ...proposalRows.map((row) => ({
        id: row.id,
        kind: "proposal" as const,
        action: "Pending",
        caseId: row.caseId,
        caseName: row.caseName,
        label: proposalActivityLabel({
          summary: row.summary,
          capabilityId: row.capabilityId,
          playbookId: row.playbookId,
          patch: row.patch,
          entityNames: proposalEntityNames,
          entitySlugs: proposalEntitySlugs,
        }),
        status: "pending",
        at: row.at.toISOString(),
      })),
      ...taskEvents.map((row) => mapTaskEvent(row, users)),
    ];

    return mergeActivityItems(items, limit);
  });
}
