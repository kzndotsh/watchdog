import { Effect } from "effect";

import {
  activityLogRepo,
  type ProposalActivityLabelRow,
  type RecentActivityLogRow,
} from "@watchdog/db";
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

type FeedUsers = ReadonlyMap<string, { name: string; email: string }>;

export interface ListRecentActivityOpts {
  organizationId: OrganizationId;
  caseId?: CaseId;
  limit?: number;
}

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 100;

function clampActivityLimit(value: number | undefined): number {
  const n = value ?? DEFAULT_LIMIT;
  if (!Number.isFinite(n)) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, Math.trunc(n)), MAX_LIMIT);
}

export { clampActivityLimit };

/**
 * The `(kind, action)` pairs of the activity log the workspace feed shows
 * (ADR-0005 decision 5); everything else in the log drives the live signal only.
 * Task edits that keep the status and reorders are in the log (they notify) but
 * not in the feed, as before. Evidence shows when it was captured (hide, restore,
 * attach and process are not feed rows, as before). Proposals show as history:
 * proposed, then accepted or rejected (ADR-0005 "As built: S6"). Graph and Case
 * entries stay out: widening the feed to them is a product decision.
 */
export const FEED_ACTIONS = {
  task: ["created", "status_changed", "deleted"],
  job: ["queued", "running", "succeeded", "failed", "cancelled"],
  evidence: ["captured"],
  proposal: ["created", "accepted", "rejected"],
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
  users: FeedUsers
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

function mapEvidenceEntry(
  row: RecentActivityLogRow,
  users: FeedUsers
): ActivityItem {
  return {
    id: String(row.id),
    kind: "evidence",
    action: "Captured",
    caseId: row.caseId,
    caseName: row.caseName,
    label: row.label ?? "Evidence",
    at: row.at.toISOString(),
    actor:
      row.actorId === null
        ? undefined
        : labelForActor(row.actorId, users, row.actorLabel),
  };
}

/** Display verb for a Proposal entry. */
export function proposalEventAction(action: string): string {
  if (action === "accepted") return "Accepted";
  if (action === "rejected") return "Rejected";
  return "Proposed";
}

function mapProposalEntry(
  row: RecentActivityLogRow,
  users: FeedUsers,
  label: string
): ActivityItem {
  const decided = row.action === "accepted" || row.action === "rejected";
  return {
    id: String(row.id),
    kind: "proposal",
    action: proposalEventAction(row.action),
    caseId: row.caseId,
    caseName: row.caseName,
    label,
    status: decided ? row.action : "pending",
    fromStatus: decided ? (row.fromValue ?? "pending") : undefined,
    toStatus: decided ? (row.toValue ?? row.action) : undefined,
    at: row.at.toISOString(),
    actor:
      row.actorId === null
        ? undefined
        : labelForActor(row.actorId, users, row.actorLabel),
  };
}

function proposalLabelsEffect(
  rows: readonly RecentActivityLogRow[]
): Effect.Effect<Map<string, string>, DomainTag, Db> {
  return Effect.gen(function* proposalLabelsGen() {
    const proposalIds = rows.flatMap((row) =>
      row.kind === "proposal" && row.subjectId !== null ? [row.subjectId] : []
    );
    if (proposalIds.length === 0) return new Map<string, string>();
    const labelRows: ProposalActivityLabelRow[] = yield* tryDbWith((exec) =>
      activityLogRepo.proposalLabelRows(exec, proposalIds)
    );
    const { entityNames, entitySlugs } =
      yield* loadEntityDisplayMapsForProposalPatchesEffect(labelRows);
    return new Map(
      labelRows.map(
        (row) =>
          [
            row.id,
            proposalActivityLabel({
              summary: row.summary,
              capabilityId: row.capabilityId,
              playbookId: row.playbookId,
              patch: row.patch,
              entityNames,
              entitySlugs,
            }),
          ] as const
      )
    );
  });
}

/**
 * Recent activity (ADR-0005 decision 5): one org-scoped read of the log through
 * the `FEED_ACTIONS` allowlist, newest first, collapsed by `group_id` in SQL,
 * then labels and actor names resolved with joins. History, not current state:
 * a Job shows as queued, running and succeeded rows, a Proposal as proposed and
 * decided. It never reads the Evidence, Job or Proposal tables for rows, only
 * for the labels of entries the log already named.
 */
export function listRecentActivityEffect(
  opts: ListRecentActivityOpts
): Effect.Effect<ActivityItem[], DomainTag, Db> {
  const limit = clampActivityLimit(opts.limit);
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
    const rows = yield* tryDbWith((exec) =>
      activityLogRepo.recentFeed(exec, {
        organizationId: opts.organizationId,
        caseId: scopedCaseId,
        filters: [
          { kind: "task", actions: FEED_ACTIONS.task },
          { kind: "job", actions: FEED_ACTIONS.job },
          { kind: "evidence", actions: FEED_ACTIONS.evidence },
          { kind: "proposal", actions: FEED_ACTIONS.proposal },
        ],
        limit,
      })
    );
    const users = yield* loadActorUsersEffect(rows.map((row) => row.actorId));
    const jobItems = yield* mapJobFeedRowsEffect(
      rows.filter((row) => row.kind === "job"),
      users
    );
    const jobItemById = new Map(jobItems.map((item) => [item.id, item]));
    const proposalLabels = yield* proposalLabelsEffect(rows);

    const items: ActivityItem[] = [];
    for (const row of rows) {
      if (row.kind === "task") items.push(mapTaskEvent(row, users));
      if (row.kind === "evidence") items.push(mapEvidenceEntry(row, users));
      if (row.kind === "proposal") {
        items.push(
          mapProposalEntry(
            row,
            users,
            (row.subjectId === null
              ? undefined
              : proposalLabels.get(row.subjectId)) ?? "Proposal"
          )
        );
      }
      if (row.kind === "job") {
        const item = jobItemById.get(String(row.id));
        if (item !== undefined) items.push(item);
      }
    }
    return items;
  });
}
