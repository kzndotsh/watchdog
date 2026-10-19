import { z } from "zod";

import { trimmedEntityKindSchema } from "./enums";
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

/** Shared fields for entity POST (web forms + API + CLI). */
export const createEntityFieldsSchema = createEntityFieldsBase
  .transform((data) => {
    const slug = entitySlugSchema.parse(
      trimmedOrUndefined(data.slug) ?? slugifyName(data.name)
    );
    return {
      kind: data.kind,
      name: data.name,
      slug,
    };
  })
  .refine((data) => data.slug.length > 0, {
    message: "Slug is required",
    path: ["slug"],
  });

/** Entity POST body including case scope. */
export const createEntityInputSchema = z
  .object({
    caseId: trimmedCaseIdSchema,
    kind: trimmedEntityKindSchema,
    name: requiredText(NAME_MAX),
    slug: z.string().max(SLUG_MAX).optional(),
  })
  .transform((data) => ({
    caseId: data.caseId,
    ...createEntityFieldsSchema.parse(data),
  }));

export type CreateEntityFieldsInput = z.input<typeof createEntityFieldsSchema>;
export type CreateEntityFields = z.output<typeof createEntityFieldsSchema>;
export type CreateEntityInput = z.output<typeof createEntityInputSchema>;
