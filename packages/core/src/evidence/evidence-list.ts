import { Effect } from "effect";

import { evidenceListRepo } from "@watchdog/db";
import type { EvidenceListRow } from "@watchdog/db";
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
