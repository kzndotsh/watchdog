import { z } from "zod";

import { slugifyName } from "@/lib/utils";
import type { EntityRecord as CoreEntityRecord } from "@watchdog/core";
import {
  entityKindSchema,
  nonEmptyTrimmed,
  trimmedOrUndefined,
  uuidSchema,
} from "@watchdog/schemas";

export type EntityRecord = CoreEntityRecord;

export const caseIdInputSchema = z.object({
  caseId: uuidSchema,
});
export type CaseIdInput = z.output<typeof caseIdInputSchema>;

export const caseSlugInputSchema = z.object({
  caseId: uuidSchema,
  slug: nonEmptyTrimmed,
});
export type CaseSlugInput = z.output<typeof caseSlugInputSchema>;

export const createEntityInputSchema = z
  .object({
    caseId: uuidSchema,
    kind: entityKindSchema,
    name: nonEmptyTrimmed,
    slug: z.string().optional(),
  })
  .transform((data) => {
    const slug = (
      trimmedOrUndefined(data.slug) ?? slugifyName(data.name)
    ).trim();
    return {
      caseId: data.caseId,
      kind: data.kind,
      name: data.name,
      slug,
    };
  })
  .refine((data) => data.slug.length > 0, {
    message: "Slug is required",
    path: ["slug"],
  });
export type CreateEntityInput = z.output<typeof createEntityInputSchema>;

export const updateEntityFieldsInputSchema = z
  .object({
    caseId: uuidSchema,
    entityId: uuidSchema,
    kind: entityKindSchema.optional(),
    name: nonEmptyTrimmed.optional(),
    summary: z.string().optional(),
    notes: z.string().optional(),
  })
  .refine(
    (data) =>
      data.kind !== undefined ||
      data.name !== undefined ||
      data.summary !== undefined ||
      data.notes !== undefined,
    {
      message: "Nothing to update",
    }
  );
export type UpdateEntityFieldsInput = z.output<
  typeof updateEntityFieldsInputSchema
>;

export const deleteEntityInputSchema = z.object({
  caseId: uuidSchema,
  entityId: uuidSchema,
});
export type DeleteEntityInput = z.output<typeof deleteEntityInputSchema>;
