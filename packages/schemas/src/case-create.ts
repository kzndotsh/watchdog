import { z } from "zod";

import { NAME_MAX, NOTES_MAX, SLUG_MAX } from "./limits";
import {
  entitySlugSchema,
  optionalText,
  requiredText,
  slugifyName,
  trimmedOrUndefined,
} from "./primitives";

/** Case-create input: the one definition (web form + server fn, API, CLI). */
export const createCaseInputSchema = z
  .object({
    name: requiredText(NAME_MAX),
    slug: z.string().max(SLUG_MAX).optional(),
    description: optionalText(NOTES_MAX),
  })
  .transform((data) => {
    const slug = entitySlugSchema.parse(
      trimmedOrUndefined(data.slug) ?? slugifyName(data.name)
    );
    return {
      name: data.name,
      slug,
      description: data.description,
    };
  })
  .refine((data) => data.slug.length > 0, {
    message: "Slug is required",
    path: ["slug"],
  });

export type CreateCaseInput = z.input<typeof createCaseInputSchema>;
export type CreateCaseFields = z.output<typeof createCaseInputSchema>;
