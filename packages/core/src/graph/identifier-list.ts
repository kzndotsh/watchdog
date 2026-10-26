import { Effect } from "effect";

import { identifierListRepo } from "@watchdog/db";
import type { IdentifierListPageRow } from "@watchdog/db";
import { identifierList } from "@watchdog/schemas/graph";
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
import { toCaseIdentifierRecord } from "./identifiers";
import type { CaseIdentifierRecord } from "./identifiers";
import { assertCaseInOrgEffect } from "./patch/guards";

/** Rows to wire records, with each Identifier's Evidence ids. */
function identifierItems(
  rows: readonly IdentifierListPageRow[]
): Effect.Effect<readonly CaseIdentifierRecord[], DomainTag, Db> {
  return evidenceLinksRepoFxDb
    .listForIdentifiers(rows.map((row) => row.id))
    .pipe(
      Effect.map((byId) =>
        rows.map((row) => toCaseIdentifierRecord(row, byId.get(row.id) ?? []))
      )
    );
}

/**
 * One page of the Case's Identifier list (`identifierList`, ADR-0007). One Entity's Identifiers
 * are this list with the `entityId` filter: an id outside the Case matches nothing.
 */
export function listIdentifiersEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof identifierList>
): Effect.Effect<ListPage<CaseIdentifierRecord>, DomainTag, Db> {
  return Effect.gen(function* listIdentifiersGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: identifierList,
      repo: identifierListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: identifierItems,
    });
  });
}

/**
 * The Case's Identifiers with these ids (rows a screen names but has not loaded), at most
 * `ARRAY_MAX`. Ids outside the Case are left out, so the result may be shorter than `ids`.
 */
export function getIdentifiersByIdsEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  ids: readonly string[]
): Effect.Effect<CaseIdentifierRecord[], DomainTag, Db> {
  return Effect.gen(function* getIdentifiersByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: identifierListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: identifierItems,
    });
    return [...items];
  });
}
