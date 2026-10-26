import { createServerFn } from "@tanstack/react-start";

import type {
  CaseIdentifierRecord,
  IdentifierRecord,
} from "@/domains/entities/identifiers/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext } from "@/lib/orpc.server";
import {
  caseScopeInputSchema,
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  identifierList,
  updateIdentifierInputSchema,
} from "@watchdog/schemas/graph";
import type { ListPage } from "@watchdog/schemas/shared";

export type {
  CaseIdentifierRecord,
  IdentifierRecord,
} from "@/domains/entities/identifiers/types";

/**
 * One page of the Case's Identifier list (`identifierList`, ADR-0007): the declared filters, `q`,
 * sort and cursor pass through whole. One Entity's Identifiers are this list with `entityId` set.
 */
export const listIdentifiersPageFn = createServerFn({ method: "GET" })
  .validator(identifierList.input)
  .handler(async ({ data, context }): Promise<ListPage<CaseIdentifierRecord>> =>
    orpcFromContext(context).identifiers.list(data)
  );

/** Every page of the Case's Identifiers, for the Case overview's count (until it moves to `cases.counts`). */
export const listIdentifiersForCaseFn = createServerFn({ method: "GET" })
  .validator(caseScopeInputSchema)
  .handler(async ({ data, context }): Promise<CaseIdentifierRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).identifiers.list({
        caseId: data.caseId,
        ...page,
      })
    )
  );

export const createIdentifierFn = createServerFn({ method: "POST" })
  .validator(createIdentifierInputSchema)
  .handler(async ({ data, context }): Promise<IdentifierRecord> =>
    orpcFromContext(context).identifiers.create(data)
  );

export const updateIdentifierFn = createServerFn({ method: "POST" })
  .validator(updateIdentifierInputSchema)
  .handler(async ({ data, context }): Promise<IdentifierRecord> =>
    orpcFromContext(context).identifiers.update(data)
  );

export const deleteIdentifierFn = createServerFn({ method: "POST" })
  .validator(deleteIdentifierInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).identifiers.delete({
      caseId: data.caseId,
      identifierId: data.identifierId,
    });
  });
