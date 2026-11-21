import { Effect } from "effect";

import { identifierListRepo } from "#db";
import type { IdentifierListPageRow } from "#db";
import { identifierList } from "@watchdog/domain/schemas/graph";
import type { IdentifierTypeCounts } from "@watchdog/domain/schemas/graph";
import {
  IDENTIFIER_TYPES,
  LIST_TOTAL_CAP,
  opsOf,
} from "@watchdog/domain/schemas/shared";
import type {
  CaseId,
  ListInput,
  ListPage,
  OrganizationId,
} from "@watchdog/domain/schemas/shared";

import { assertCaseInOrgEffect } from "../cases/access";
import type { DomainTag } from "../errors/tagged-errors";
import type { Db } from "../infra/db-service";
import {
  listByIdsEffect,
  listCountsByEffect,
  listPageEffect,
} from "../infra/list-page";
import { inOrganization } from "../infra/organization-scope";
import { evidenceLinksRepoFxDb } from "../infra/repos-fx";
import { toCaseIdentifierRecord } from "./identifiers";
import type { CaseIdentifierRecord } from "./identifiers";

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
  const program = Effect.gen(function* listIdentifiersGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    return yield* listPageEffect({
      def: identifierList,
      repo: identifierListRepo,
      scope: { caseId: scopedCaseId },
      input,
      toItems: identifierItems,
    });
  });
  return inOrganization(organizationId, program);
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
  const program = Effect.gen(function* getIdentifiersByIdsGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const items = yield* listByIdsEffect({
      repo: identifierListRepo,
      scope: { caseId: scopedCaseId },
      ids,
      toItems: identifierItems,
    });
    return [...items];
  });
  return inOrganization(organizationId, program);
}

/**
 * The Identifiers the list's filters and `q` match, per type (`identifiers.typeCounts`): the
 * headers of an Entity's Identifiers grouped by type, so each group's count is right before its
 * rows are read. Cursor, limit and sort in `input` are ignored.
 */
export function countIdentifiersByTypeEffect(
  caseId: CaseId,
  organizationId: OrganizationId,
  input: ListInput<typeof identifierList>
): Effect.Effect<IdentifierTypeCounts, DomainTag, Db> {
  const program = Effect.gen(function* countIdentifiersByTypeGen() {
    const scopedCaseId = yield* assertCaseInOrgEffect(caseId, organizationId);
    const { counts, isCapped } = yield* listCountsByEffect({
      repo: identifierListRepo,
      scope: { caseId: scopedCaseId },
      query: opsOf(identifierList).queryOf(input),
      key: "type",
      cap: LIST_TOTAL_CAP,
    });
    return {
      counts: counts.flatMap((row) => {
        const type = IDENTIFIER_TYPES.find((known) => known === row.value);
        return type === undefined ? [] : [{ type, count: row.count }];
      }),
      isCapped,
    };
  });
  return inOrganization(organizationId, program);
}
