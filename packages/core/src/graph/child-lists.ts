import { Effect } from "effect";

import {
  claimListRepo,
  edgeListRepo,
  eventListRepo,
  questionListRepo,
} from "@watchdog/db";
import type { ClaimListRow, EdgeListPageRow } from "@watchdog/db";
import {
  claimList,
  edgeList,
  eventList,
  questionList,
} from "@watchdog/schemas/graph";
import type {
  CaseId,
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/schemas/shared";

import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { evidenceLinksRepoFxDb } from "../infra/repos-fx";
import type { DomainTag } from "../infra/tagged-errors";
import { toCaseEdgeRecord, type CaseEdgeRecord } from "./edges";
import {
  toClaimRecord,
  toEventRecord,
  toQuestionRecord,
  type ClaimRecord,
  type EventRecord,
  type QuestionRecord,
} from "./mutation/tables";
import { assertCaseInOrgEffect } from "./patch/guards";

/*
 * The Case-wide lists of an Entity's children (ADR-0007): Claims, Events, Questions and
 * Connections. Each is one list per Case; an Entity's are the list with `entityId` set (the
 * Dossier tabs), and an id outside the Case matches nothing. There is no per-Entity route.
 */

/** Claim rows to wire records, with each Claim's Evidence ids. */
function claimItems(
  rows: readonly ClaimListRow[]
): Effect.Effect<readonly ClaimRecord[], DomainTag, Db> {
  return evidenceLinksRepoFxDb
    .listForClaims(rows.map((row) => row.id))
    .pipe(
      Effect.map((byId) =>
        rows.map((row) => toClaimRecord(row, byId.get(row.id) ?? []))
      )
    );
}

/** Connection rows to wire records (both ends' labels), with each one's Evidence ids. */
function edgeItems(
  rows: readonly EdgeListPageRow[]
): Effect.Effect<readonly CaseEdgeRecord[], DomainTag, Db> {
  return evidenceLinksRepoFxDb
    .listForEdges(rows.map((row) => row.id))
    .pipe(
      Effect.map((byId) =>
        rows.map((row) => toCaseEdgeRecord(row, byId.get(row.id) ?? []))
      )
    );
}

/** One page of the Case's Claim list (`claimList`). */
export function listClaimsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof claimList>
): Effect.Effect<ListPage<ClaimRecord>, DomainTag, Db> {
  return Effect.gen(function* listClaimsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: claimList,
      repo: claimListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: claimItems,
    });
  });
}

/** One page of the Case's Event list (`eventList`). */
export function listEventsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof eventList>
): Effect.Effect<ListPage<EventRecord>, DomainTag, Db> {
  return Effect.gen(function* listEventsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: eventList,
      repo: eventListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: (rows) => Effect.succeed(rows.map(toEventRecord)),
    });
  });
}

/** One page of the Case's Question list (`questionList`). */
export function listQuestionsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof questionList>
): Effect.Effect<ListPage<QuestionRecord>, DomainTag, Db> {
  return Effect.gen(function* listQuestionsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: questionList,
      repo: questionListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: (rows) => Effect.succeed(rows.map(toQuestionRecord)),
    });
  });
}

/** One page of the Case's Connection list (`edgeList`): both ends on every row. */
export function listEdgesEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof edgeList>
): Effect.Effect<ListPage<CaseEdgeRecord>, DomainTag, Db> {
  return Effect.gen(function* listEdgesGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: edgeList,
      repo: edgeListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: edgeItems,
    });
  });
}

/** The Case's Claims with these ids, retracted or not, at most `ARRAY_MAX`; ids outside the Case are left out. */
export function getClaimsByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<ClaimRecord[], DomainTag, Db> {
  return Effect.gen(function* getClaimsByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: claimListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: claimItems,
    });
    return [...items];
  });
}

/** The Case's Events with these ids, at most `ARRAY_MAX`; ids outside the Case are left out. */
export function getEventsByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<EventRecord[], DomainTag, Db> {
  return Effect.gen(function* getEventsByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: eventListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: (rows) => Effect.succeed(rows.map(toEventRecord)),
    });
    return [...items];
  });
}

/** The Case's Questions with these ids, at most `ARRAY_MAX`; ids outside the Case are left out. */
export function getQuestionsByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<QuestionRecord[], DomainTag, Db> {
  return Effect.gen(function* getQuestionsByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: questionListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: (rows) => Effect.succeed(rows.map(toQuestionRecord)),
    });
    return [...items];
  });
}

/**
 * The Case's Connections with these ids (one the ego graph draws but the list has not loaded),
 * at most `ARRAY_MAX`. Ids outside the Case are left out, so the result may be shorter.
 */
export function getEdgesByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<CaseEdgeRecord[], DomainTag, Db> {
  return Effect.gen(function* getEdgesByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: edgeListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: edgeItems,
    });
    return [...items];
  });
}
