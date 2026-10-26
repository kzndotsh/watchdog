import { createServerFn } from "@tanstack/react-start";

import {
  caseIdInputSchema,
  caseSlugInputSchema,
  type EntityRecord,
} from "@/domains/entities/types";
import { listAllPages } from "@/lib/list-pages.server";
import { orpcFromContext, orpcNullIfNotFound } from "@/lib/orpc.server";
import { normalizeEntitySlug } from "@/shared/lib/route-slug";
import {
  createEntityInputSchema,
  deleteEntityInputSchema,
  entityList,
  getEntitiesInputSchema,
  updateEntityInputSchema as updateEntityFieldsInputSchema,
} from "@watchdog/schemas/graph";
import { recordAiHandoffInputSchema } from "@watchdog/schemas/shared";
import type { ListPage } from "@watchdog/schemas/shared";

export const listEntitiesFn = createServerFn({ method: "GET" })
  .validator(caseIdInputSchema)
  .handler(async ({ data, context }): Promise<EntityRecord[]> =>
    listAllPages(async (page) =>
      orpcFromContext(context).entities.list({ caseId: data.caseId, ...page })
    )
  );

/** One page of the Case's Entity list (`entityList`, ADR-0007): the server-searched Entity pickers. */
export const listEntitiesPageFn = createServerFn({ method: "GET" })
  .validator(entityList.input)
  .handler(async ({ data, context }): Promise<ListPage<EntityRecord>> =>
    orpcFromContext(context).entities.list(data)
  );

/** Entities by id (a picker's value, a filter chip's title); ids outside the Case are left out. */
export const getEntitiesFn = createServerFn({ method: "GET" })
  .validator(getEntitiesInputSchema)
  .handler(async ({ data, context }): Promise<EntityRecord[]> =>
    orpcFromContext(context).entities.getMany(data)
  );

export const getEntityBySlugFn = createServerFn({ method: "GET" })
  .validator(caseSlugInputSchema)
  .handler(async ({ data, context }): Promise<EntityRecord | null> => {
    const slug = normalizeEntitySlug(data.slug);
    if (slug === undefined) return null;
    return orpcNullIfNotFound(
      orpcFromContext(context).entities.get({
        caseId: data.caseId,
        slug,
      })
    );
  });

export const createEntityFn = createServerFn({ method: "POST" })
  .validator(createEntityInputSchema)
  .handler(async ({ data, context }): Promise<EntityRecord> =>
    orpcFromContext(context).entities.create(data)
  );

export const updateEntityFieldsFn = createServerFn({ method: "POST" })
  .validator(updateEntityFieldsInputSchema)
  .handler(async ({ data, context }): Promise<EntityRecord> =>
    orpcFromContext(context).entities.update(data)
  );

/** Record an external AI handoff (actor, Entity, destination; never the text). */
export const recordAiHandoffFn = createServerFn({ method: "POST" })
  .validator(recordAiHandoffInputSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> =>
    orpcFromContext(context).entities.recordAiHandoff(data)
  );

export const deleteEntityFn = createServerFn({ method: "POST" })
  .validator(deleteEntityInputSchema)
  .handler(async ({ data, context }): Promise<void> => {
    await orpcFromContext(context).entities.delete({
      caseId: data.caseId,
      entityId: data.entityId,
    });
  });
