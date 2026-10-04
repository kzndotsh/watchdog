import { z } from "zod";

import {
  entitySlugSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  slugifyName,
  trimmedOrUndefined,
} from "./primitives";

/** Case-create input: the one definition (web form + server fn, API, CLI). */
export const createCaseInputSchema = z
  .object({
    name: nonEmptyTrimmed,
    slug: z.string().optional(),
    description: optionalTrimmedSchema,
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
