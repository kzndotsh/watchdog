import { z } from "zod";

import { trimmedEntityKindSchema } from "./enums";
import { createIdentifierFieldsSchema } from "./identifier-create";
import { trimmedCaseIdSchema } from "./ids";
import { NAME_MAX, SLUG_MAX } from "./limits";
import {
  entitySlugSchema,
  requiredText,
  slugifyName,
  trimmedOrUndefined,
} from "./primitives";

const createEntityFieldsBase = z.object({
  kind: trimmedEntityKindSchema,
  name: requiredText(NAME_MAX),
  slug: z.string().max(SLUG_MAX).optional(),
});

/** The slug given, else one from the name; an issue (never a throw) when neither yields one. */
function entitySlugOrIssue(
  data: { name: string; slug?: string | undefined },
  ctx: z.RefinementCtx
): string {
  const slug = entitySlugSchema.safeParse(
    trimmedOrUndefined(data.slug) ?? slugifyName(data.name)
  );
  if (slug.success) return slug.data;
  ctx.addIssue({ code: "custom", message: "Slug is required", path: ["slug"] });
  return z.NEVER;
}

/** Shared fields for entity POST (web forms + API + CLI). */
export const createEntityFieldsSchema = createEntityFieldsBase.transform(
  (data, ctx) => ({
    kind: data.kind,
    name: data.name,
    slug: entitySlugOrIssue(data, ctx),
  })
);

/** Entity POST body before its transform: an API procedure extends it with its own fields. */
export const createEntityInputObjectSchema = createEntityFieldsBase.extend({
  caseId: trimmedCaseIdSchema,
  identifier: createIdentifierFieldsSchema.optional(),
});

/** What a create body becomes: the slug resolved, and only the fields core reads. */
export function toCreateEntityInput(
  data: z.output<typeof createEntityInputObjectSchema>,
  ctx: z.RefinementCtx
) {
  return {
    caseId: data.caseId,
    kind: data.kind,
    name: data.name,
    slug: entitySlugOrIssue(data, ctx),
    ...(data.identifier === undefined ? {} : { identifier: data.identifier }),
  };
}

/**
 * Entity POST body including case scope. With `identifier`, the Entity is created holding that
 * Identifier, in the same write (a found value added as a new Entity).
 */
export const createEntityInputSchema =
  createEntityInputObjectSchema.transform(toCreateEntityInput);

export type CreateEntityFieldsInput = z.input<typeof createEntityFieldsSchema>;
export type CreateEntityFields = z.output<typeof createEntityFieldsSchema>;
export type CreateEntityInput = z.output<typeof createEntityInputSchema>;
