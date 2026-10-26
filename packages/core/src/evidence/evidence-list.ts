import { Effect } from "effect";

import { evidenceListRepo, evidencePickerListRepo } from "@watchdog/db";
import type { EvidenceListRow, EvidencePickerListRow } from "@watchdog/db";
import { evidenceList } from "@watchdog/schemas/evidence";
import type {
  CaseId,
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/schemas/shared";

import { loadActorUsersEffect } from "../actors/resolve-actor-labels";
import { assertCaseInOrgEffect } from "../graph/patch/guards";
import type { Db } from "../infra/db-service";
import { listByIdsEffect, listPageEffect } from "../infra/list-page";
import { NotFoundError, type DomainTag } from "../infra/tagged-errors";
import { toEvidenceRecord, type EvidenceRecord } from "./evidence";

/** Rows to wire records, with the actors' current labels. */
function evidenceItems(
  rows: readonly EvidenceListRow[]
): Effect.Effect<readonly EvidenceRecord[], DomainTag, Db> {
  return loadActorUsersEffect(rows.map((row) => row.actorId)).pipe(
    Effect.map((users) => rows.map((row) => toEvidenceRecord(row, users)))
  );
}

/**
 * One page of the Case's Evidence list (`evidenceList`, ADR-0007): the declared filters, `q` and
 * sort, keyset paged, with `total` on the first page. `input` is `evidenceList.input`'s output, so
 * a short `q` and an exclusive pair were already refused as 400s.
 */
export function listEvidenceEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof evidenceList>
): Effect.Effect<ListPage<EvidenceRecord>, DomainTag, Db> {
  return Effect.gen(function* listEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: evidenceList,
      repo: evidenceListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: evidenceItems,
    });
  });
}

/** What an Evidence picker shows of an item: its title parts and capture time, never the body. */
export type EvidencePickerItem = {
  id: string;
  kind: EvidenceRecord["kind"];
  label: string | null;
  sourceUrl: string | null;
  sha256: string | null;
  capturedAt: string;
};

function pickerItems(
  rows: readonly EvidencePickerListRow[]
): Effect.Effect<readonly EvidencePickerItem[]> {
  return Effect.succeed(
    rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      label: row.label ?? null,
      sourceUrl: row.sourceUrl ?? null,
      sha256: row.sha256 ?? null,
      capturedAt: row.capturedAt.toISOString(),
    }))
  );
}

/**
 * One page of `evidenceList` for the Evidence pickers (#566): the same declaration, scope, filters,
 * `q`, sort and cursor as `listEvidenceEffect` (`evidencePickerListRepo` shares its binding), with
 * the picker's columns instead of the record.
 */
export function listEvidencePickerEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof evidenceList>
): Effect.Effect<ListPage<EvidencePickerItem>, DomainTag, Db> {
  return Effect.gen(function* listEvidencePickerGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: evidenceList,
      repo: evidencePickerListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: pickerItems,
    });
  });
}

/**
 * One Evidence item of the Case by id, hidden or not (a URL-selected row that is not loaded).
 * `NotFoundError` when the id is not in the Case.
 */
export function getEvidenceEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  evidenceId: string
): Effect.Effect<EvidenceRecord, DomainTag, Db> {
  return Effect.gen(function* getEvidenceGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const [found] = yield* listByIdsEffect({
      repo: evidenceListRepo,
      scope: { caseId: scopedCaseId },
      ids: [evidenceId],
      toItems: evidenceItems,
    });
    if (found === undefined) {
      return yield* new NotFoundError({ entity: "Evidence", id: evidenceId });
    }
    return found;
  });
}

/**
 * The Case's Evidence with these ids, hidden or not (linked Evidence titles, a picker's selected
 * items), at most `ARRAY_MAX`. Ids outside the Case are left out, so the result may be shorter.
 */
export function getEvidenceByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<EvidenceRecord[], DomainTag, Db> {
  return Effect.gen(function* getEvidenceByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: evidenceListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: evidenceItems,
    });
    return [...items];
  });
}
