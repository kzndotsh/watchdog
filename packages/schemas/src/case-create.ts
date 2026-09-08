import { z } from "zod";

import {
  entitySlugSchema,
  nonEmptyTrimmed,
  optionalTrimmedSchema,
  slugifyName,
  trimmedOrUndefined,
} from "./primitives";

/** Shared fields for case POST (web forms + API + CLI). */
export const createCaseFieldsSchema = z
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

export type CreateCaseFieldsInput = z.input<typeof createCaseFieldsSchema>;
export type CreateCaseFields = z.output<typeof createCaseFieldsSchema>;
