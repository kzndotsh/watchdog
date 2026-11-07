import { Effect } from "effect";

import { activityListRepo } from "@watchdog/db";
import type { ProposalActivityLabelRow, ActivityFeedRow } from "@watchdog/db";
import { activityList, type ActivityItem } from "@watchdog/schemas/feed";
import type {
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/schemas/shared";
import {
  OPEN_IN_DESTINATION_LABELS,
  openInDestinationSchema,
  opsOf,
  parseTrimmedCaseId,
} from "@watchdog/schemas/shared";

import {
  labelForActor,
  loadActorUsersEffect,
} from "../actors/resolve-actor-labels";
import { assertCaseInOrgEffect } from "../cases/access";
import { loadEntityDisplayMapsForProposalPatchesEffect } from "../display/entity-display";
import { proposalActivityLabel } from "../display/proposal-display";
import type { DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import { listPageEffect } from "../infra/list-page";
import { activityLogRepoFxDb } from "../infra/repos-fx";
import { mapJobFeedRowsEffect } from "./job-feed";

type FeedUsers = ReadonlyMap<string, { name: string; email: string }>;

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

function mapTaskEvent(row: ActivityFeedRow, users: FeedUsers): ActivityItem {
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
  row: ActivityFeedRow,
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

/** A Dossier opened in an outside tool: the Entity, the destination and who did it; never the text. */
function mapOpenInEntry(row: ActivityFeedRow, users: FeedUsers): ActivityItem {
  const destination = openInDestinationSchema.safeParse(row.toValue);
  return {
    id: String(row.id),
    kind: "open_in",
    action: destination.success
      ? `Opened in ${OPEN_IN_DESTINATION_LABELS[destination.data]}`
      : "Opened in an external tool",
    caseId: row.caseId,
    caseName: row.caseName,
    label: row.label ?? "Entity",
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
  row: ActivityFeedRow,
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
  rows: readonly ActivityFeedRow[]
): Effect.Effect<Map<string, string>, DomainTag, Db> {
  return Effect.gen(function* proposalLabelsGen() {
    const proposalIds = rows.flatMap((row) =>
      row.kind === "proposal" && row.subjectId !== null ? [row.subjectId] : []
    );
    if (proposalIds.length === 0) return new Map<string, string>();
    const labelRows: ProposalActivityLabelRow[] =
      yield* activityLogRepoFxDb.proposalLabelRows(proposalIds);
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

function itemsOfRowsEffect(
  rows: readonly ActivityFeedRow[]
): Effect.Effect<readonly ActivityItem[], DomainTag, Db> {
  return Effect.gen(function* itemsOfRowsGen() {
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
      if (row.kind === "open_in") items.push(mapOpenInEntry(row, users));
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

/**
 * Recent activity (ADR-0005 decision 5, ADR-0007): a page of `activityList`, the organization's
 * log through the `FEED_ACTIONS` allowlist, newest first, collapsed by `group_id` in SQL, then
 * labels and actor names resolved with joins. History, not current state: a Job shows as queued,
 * running and succeeded rows, a Proposal as proposed and decided. It never reads the Evidence,
 * Job or Proposal tables for rows, only for the labels of entries the log already named. A Case
 * filter must name a Case of the organization (`not_found` otherwise). Without `input` it is the
 * first page of the default view.
 */
export function listRecentActivityEffect(opts: {
  organizationId: OrganizationId;
  input?: ListInput<typeof activityList>;
}): Effect.Effect<ListPage<ActivityItem>, DomainTag, Db> {
  return Effect.gen(function* listRecentActivityGen() {
    const input = opts.input ?? {
      limit: opsOf(activityList).pageLimit.default,
    };
    const caseId =
      input.caseId === undefined ? null : parseTrimmedCaseId(input.caseId);
    if (caseId !== null) {
      yield* assertCaseInOrgEffect(caseId, opts.organizationId);
    }
    return yield* listPageEffect({
      def: activityList,
      repo: activityListRepo,
      scope: { organizationId: opts.organizationId },
      input,
      toItems: itemsOfRowsEffect,
    });
  });
}
