import { Effect } from "effect";

import {
  collectListRepo,
  evidencePickerListRepo,
  locateCollectRow,
} from "@watchdog/db";
import type { CollectListRow, CollectMemberJson } from "@watchdog/db";
import { evidenceDisplayLabel } from "@watchdog/schemas/evidence";
import {
  collectList,
  entityIdsFromJobInputs,
  evidenceIdsFromJobInputs,
} from "@watchdog/schemas/jobs";
import type { LocateCollectInput } from "@watchdog/schemas/jobs";
import type {
  CaseId,
  CollectRowKind,
  CollectRowState,
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { loadActorUsersEffect } from "../actors/resolve-actor-labels";
import { loadEntityDisplayMapsForIdsEffect } from "../entities/entity-display";
import { toEvidenceRecord } from "../evidence/evidence";
import type { EvidenceRecord } from "../evidence/evidence";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { tryDbWith } from "../infra/postgres-effect";
import { NotFoundError } from "../infra/tagged-errors";
import type { DomainTag } from "../infra/tagged-errors";
import { toJobListRecord } from "./start-job";
import type { JobListRecord } from "./start-job";

/** The titles of the Evidence and Entities the row's Job inputs name (labels, not state). */
export type CollectQueueTitles = {
  evidence: Record<string, string>;
  entity: Record<string, string>;
};

/**
 * One row of Collect's queue (#574): an Evidence row, a playbook run or a lone Job, with the
 * member Jobs it holds and its Evidence. `state` and the Jobs come from one statement
 * (`collectListRepo`), so a row never shows a Job its state does not know.
 */
export type CollectQueueItem = {
  id: string;
  kind: CollectRowKind;
  state: CollectRowState;
  sortAt: string;
  activityAt: string;
  entityId: string | null;
  capabilityIds: string[];
  /** The run's id for a run row; null for an Evidence or lone Job row. */
  playbookRunId: string | null;
  evidence: EvidenceRecord | null;
  jobs: JobListRecord[];
  titles: CollectQueueTitles;
};

/** `collect.get`: the row an id belongs to, and the member Job to focus (null for a row id). */
export type CollectLocatedItem = {
  item: CollectQueueItem;
  focusJobId: string | null;
};

function memberRow(member: CollectMemberJson) {
  return {
    ...member,
    createdAt: new Date(member.createdAt),
    updatedAt: new Date(member.updatedAt),
    startedAt: member.startedAt === null ? null : new Date(member.startedAt),
    finishedAt: member.finishedAt === null ? null : new Date(member.finishedAt),
  };
}

/** The titles of `ids` that were found. */
function pickTitles(
  titles: Readonly<Record<string, string>>,
  ids: readonly string[]
): Record<string, string> {
  return Object.fromEntries(
    ids.flatMap((id) => {
      const title = titles[id];
      return title === undefined ? [] : [[id, title]];
    })
  );
}

/** Evidence titles by id, hidden Evidence included (an input may name one). */
function evidenceTitles(
  caseId: CaseId,
  ids: readonly string[]
): Effect.Effect<Record<string, string>, DomainTag, Db> {
  if (ids.length === 0) return Effect.succeed({});
  return listByIdsEffect({
    repo: evidencePickerListRepo,
    scope: { caseId },
    ids,
    toItems: (rows) => Effect.succeed(rows),
  }).pipe(
    Effect.map((rows) =>
      Object.fromEntries(rows.map((row) => [row.id, evidenceDisplayLabel(row)]))
    )
  );
}

/**
 * Page rows to items: the member Jobs and Evidence are already on the rows; only the actors'
 * labels and the titles of what Job inputs name are read here (a second statement of labels).
 */
function collectItems(
  caseId: CaseId,
  rows: readonly CollectListRow[]
): Effect.Effect<readonly CollectQueueItem[], DomainTag, Db> {
  return Effect.gen(function* collectItemsGen() {
    const inputs = rows.flatMap((row) =>
      row.members.map((member) => member.input)
    );
    const [users, evidence, entityMaps] = yield* Effect.all([
      loadActorUsersEffect([
        ...rows.flatMap((row) => row.members.map((member) => member.actorId)),
        ...rows.map((row) => row.evidence?.actorId),
      ]),
      evidenceTitles(caseId, evidenceIdsFromJobInputs(inputs)),
      loadEntityDisplayMapsForIdsEffect(caseId, entityIdsFromJobInputs(inputs)),
    ]);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      state: row.state,
      sortAt: row.sortAt.toISOString(),
      activityAt: row.activityAt.toISOString(),
      entityId: row.entityId,
      capabilityIds: row.capabilityIds,
      playbookRunId: row.kind === "run" ? row.id : null,
      evidence:
        row.evidence === null ? null : toEvidenceRecord(row.evidence, users),
      jobs: row.members.map((member) => {
        const job = memberRow(member);
        return toJobListRecord(
          job,
          {
            playbookId: member.playbookId,
            playbookRunStatus: member.playbookRunStatus,
            playbookRunOutcome: member.playbookRunOutcome,
          },
          users
        );
      }),
      titles: {
        evidence: pickTitles(
          evidence,
          evidenceIdsFromJobInputs(row.members.map((member) => member.input))
        ),
        entity: pickTitles(
          entityMaps.entityNames,
          entityIdsFromJobInputs(row.members.map((member) => member.input))
        ),
      },
    }));
  });
}

/**
 * One page of Collect's queue (`collectList`, ADR-0007): the declared filters, `q` and sort,
 * keyset paged, with `total` on the first page.
 */
export function listCollectEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof collectList>
): Effect.Effect<ListPage<CollectQueueItem>, DomainTag, Db> {
  return Effect.gen(function* listCollectGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: collectList,
      repo: collectListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: (rows) => collectItems(scopedCaseId, rows),
    });
  });
}

/**
 * The row an id belongs to (`locateCollectRow`: a row, a member Job, or a run whose steps all
 * attached), read in full, with the Job to focus. `NotFoundError` when nothing matches in the
 * list's mode, which the screen turns into dropping `?id`.
 */
export function getCollectItemEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: Pick<LocateCollectInput, "id" | "hidden">
): Effect.Effect<CollectLocatedItem, DomainTag, Db> {
  return Effect.gen(function* getCollectItemGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const found = yield* tryDbWith((exec) =>
      locateCollectRow(exec, scopedCaseId, input.id, input.hidden === true)
    );
    const [item] =
      found === null
        ? []
        : yield* listByIdsEffect({
            repo: collectListRepo,
            scope: { caseId: scopedCaseId },
            ids: [found.rowId],
            toItems: (rows) => collectItems(scopedCaseId, rows),
          });
    if (found === null || item === undefined) {
      return yield* new NotFoundError({ entity: "Collect item", id: input.id });
    }
    return { item, focusJobId: found.focusJobId };
  });
}
