import { z } from "zod";

import { caseScopeInputSchema, evidenceScopeInputSchema } from "./graph-scope";
import { BODY_MAX, NAME_MAX, NOTES_MAX } from "./limits";
import {
  httpUrlSchema,
  requiredText,
  nullableUuidSchema,
  optionalHttpUrlSchema,
  optionalText,
  optionalUuidSchema,
} from "./primitives";

/** Shared fields for evidence paste POST (web forms + API + CLI). */
export const dumpPasteFieldsSchema = z.object({
  body: requiredText(BODY_MAX),
  label: optionalText(NAME_MAX),
  sourceUrl: optionalHttpUrlSchema,
  entityId: optionalUuidSchema,
});

export type DumpPasteFields = z.output<typeof dumpPasteFieldsSchema>;

export const dumpPasteInputSchema = caseScopeInputSchema.extend(
  dumpPasteFieldsSchema.shape
);

export type DumpPasteInput = z.output<typeof dumpPasteInputSchema>;

/** Shared fields for evidence URL dump POST (web forms + API + CLI). */
export const dumpUrlFieldsSchema = z.object({
  sourceUrl: httpUrlSchema,
  label: optionalText(NAME_MAX),
  notes: optionalText(NOTES_MAX),
  entityId: optionalUuidSchema,
});

export type DumpUrlFields = z.output<typeof dumpUrlFieldsSchema>;

export const dumpUrlInputSchema = caseScopeInputSchema.extend(
  dumpUrlFieldsSchema.shape
);

export type DumpUrlInput = z.output<typeof dumpUrlInputSchema>;

export const attachEvidenceEntityInputSchema = evidenceScopeInputSchema.extend({
  entityId: nullableUuidSchema,
});

export type AttachEvidenceEntityInput = z.output<
  typeof attachEvidenceEntityInputSchema
>;

export const processEvidenceInputSchema = evidenceScopeInputSchema.extend({
  /** When true, start `evidence.extract.ai` instead of `evidence.harvest`. */
  ai: z.boolean().optional().default(false),
});

export type ProcessEvidenceInput = z.output<typeof processEvidenceInputSchema>;
