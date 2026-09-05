import { createServerFn } from "@tanstack/react-start";

import {
  caseScopeInputSchema,
  createIdentifierInputSchema,
  deleteIdentifierInputSchema,
  entityScopeInputSchema,
  updateIdentifierInputSchema,
  type CaseIdentifierRecord,
  type IdentifierRecord,
} from "@/domains/entities/identifiers/types";
import { orpcFromContext } from "@/lib/orpc.server";

export type {
  CaseIdentifierRecord,
  IdentifierRecord,
} from "@/domains/entities/identifiers/types";

export const listIdentifiersFn = createServerFn({ method: "GET" })
  .validator(entityScopeInputSchema)
  .handler(
    async ({ data, context }): Promise<IdentifierRecord[]> =>
      orpcFromContext(context).identifiers.list({
        caseId: data.caseId,
        entityId: data.entityId,
      })
  );

export const listIdentifiersForCaseFn = createServerFn({ method: "GET" })
  .validator(caseScopeInputSchema)
  .handler(
    async ({ data, context }): Promise<CaseIdentifierRecord[]> =>
      orpcFromContext(context).identifiers.listForCase({
        caseId: data.caseId,
      })
  );

export const createIdentifierFn = createServerFn({ method: "POST" })
  .validator(createIdentifierInputSchema)
  .handler(
    async ({ data, context }): Promise<IdentifierRecord> =>
      orpcFromContext(context).identifiers.create(data)
  );

export const updateIdentifierFn = createServerFn({ method: "POST" })
  .validator(updateIdentifierInputSchema)
  .handler(
    async ({ data, context }): Promise<IdentifierRecord> =>
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
