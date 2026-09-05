import { createServerFn } from "@tanstack/react-start";

import {
  caseIdInputSchema,
  caseSlugInputSchema,
  createEntityInputSchema,
  deleteEntityInputSchema,
  updateEntityFieldsInputSchema,
  type EntityRecord,
} from "@/domains/entities/types";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";

export const listEntitiesFn = createServerFn({ method: "GET" })
  .validator(caseIdInputSchema)
  .handler(
    async ({ data, context }): Promise<EntityRecord[]> =>
      orpcFromContext(context).entities.list({
        caseId: data.caseId,
      })
  );

export const getEntityBySlugFn = createServerFn({ method: "GET" })
  .validator(caseSlugInputSchema)
  .handler(
    async ({ data, context }): Promise<EntityRecord | null> =>
      orpcNullIfNotFound(
        orpcFromContext(context).entities.get({
          caseId: data.caseId,
          slug: data.slug,
        })
      )
  );

export const createEntityFn = createServerFn({ method: "POST" })
  .validator(createEntityInputSchema)
  .handler(
    async ({ data, context }): Promise<EntityRecord> =>
      orpcFromContext(context).entities.create(data)
  );

export const updateEntityFieldsFn = createServerFn({ method: "POST" })
  .validator(updateEntityFieldsInputSchema)
  .handler(
    async ({ data, context }): Promise<EntityRecord> =>
      orpcFromContext(context).entities.update(data)
  );

export const deleteEntityFn = createServerFn({ method: "POST" })
  .validator(deleteEntityInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).entities.delete({
      caseId: data.caseId,
      entityId: data.entityId,
    });
  });
