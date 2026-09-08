import { z } from "zod";

import {
  nonEmptyTrimmed,
  optionalClaimClassSchema,
  IDENTIFIER_PLATFORM_SLUGS,
  optionalIdentifierStatusSchema,
  optionalTrimmedSchema,
  trimmedIdentifierTypeSchema,
} from "@watchdog/schemas";

const PLATFORM_HINT = IDENTIFIER_PLATFORM_SLUGS.join(", ");

const draftIdentifierSchema = z.object({
  type: trimmedIdentifierTypeSchema.describe(
    "Identifier type from closed vocab"
  ),
  value: nonEmptyTrimmed.describe("Raw identifier value"),
  /**
   * Prefer a known slug when it matches Evidence; custom lowercase slug OK if not in catalog.
   * Free string — not a closed enum.
   */
  platform: z
    .string()
    .trim()
    .optional()
    .describe(
      `Platform slug for handles (and optionally email/crypto). Prefer known: ${PLATFORM_HINT}. Custom slug allowed if the site is not listed.`
    ),
  status: optionalIdentifierStatusSchema.describe(
    "current | former | unknown — only when Evidence states it"
  ),
  notes: optionalTrimmedSchema,
  evidenceQuote: optionalTrimmedSchema.describe(
    "Verbatim span from EvidenceSnapshot.text when possible"
  ),
});

const draftClaimSchema = z.object({
  text: nonEmptyTrimmed.describe("Observation text grounded in Evidence"),
  class: optionalClaimClassSchema.describe("Default observation"),
  evidenceQuote: optionalTrimmedSchema,
});

const draftQuestionSchema = z.object({
  text: nonEmptyTrimmed.describe("Open question when uncertain"),
  evidenceQuote: optionalTrimmedSchema,
});

/**
 * Semantic extract — NO confidence, NO Graph resource ids from model/harvest.
 * Harvest and AI Process Caps both emit this shape.
 */
export const processExtractDraftSchema = z.object({
  summary: optionalTrimmedSchema.describe(
    "Short extract summary for Job/Proposal"
  ),
  identifiers: z.array(draftIdentifierSchema).default([]),
  claims: z.array(draftClaimSchema).default([]),
  questions: z.array(draftQuestionSchema).default([]),
});

export type ProcessExtractDraft = z.infer<typeof processExtractDraftSchema>;

export function isEmptyDraft(draft: ProcessExtractDraft): boolean {
  return (
    draft.identifiers.length === 0 &&
    draft.claims.length === 0 &&
    draft.questions.length === 0
  );
}
