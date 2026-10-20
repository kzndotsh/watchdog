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
  entityScopeInputSchema,
  updateIdentifierInputSchema,
} from "@watchdog/schemas/graph";

export type {
  CaseIdentifierRecord,
  IdentifierRecord,
} from "@/domains/entities/identifiers/types";

export const listIdentifiersFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(async ({ data, context }): Promise<IdentifierRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).identifiers.list({
        caseId: data.caseId,
        entityId: data.entityId,
        ...page,
      })
    )
  );

export const listIdentifiersForCaseFn = createServerFn({ method: "GET" })
  .validator(caseScopeInputSchema)
  .handler(async ({ data, context }): Promise<CaseIdentifierRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).identifiers.listForCase({
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
