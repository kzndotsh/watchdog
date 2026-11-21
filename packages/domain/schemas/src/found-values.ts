import { z } from "zod";

import { identifierTypeSchema } from "./enums";
import type { IdentifierType } from "./vocab";

/** At most this many found values are returned for one Job; the rest are counted. */
export const FOUND_VALUES_MAX = 2000;

/** At most this many Entities are named for one found value. */
export const FOUND_VALUE_ENTITIES_MAX = 20;

/**
 * One typed value a Cap's report holds, as the Cap's `found` reader names it: every value the
 * report has, not only the ones its Proposal carries. `source` says where in the report it came
 * from ("NS record", "Certificate name"). Never a Graph row: a human turns one into an
 * Identifier.
 */
export type FoundValue = {
  readonly type: IdentifierType;
  readonly value: string;
  /** Required for a handle; empty otherwise. */
  readonly platform?: string;
  readonly source: string;
};

const foundValueEntitySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  slug: z.string(),
});

export const foundValueRecordSchema = z.object({
  type: identifierTypeSchema,
  platform: z.string(),
  value: z.string(),
  /** Every place in the report the value appeared, deduped. */
  sources: z.array(z.string()),
  /** Entities of the Case that already hold this value as an Identifier. */
  onEntities: z.array(foundValueEntitySchema).max(FOUND_VALUE_ENTITIES_MAX),
});

export const jobFoundValuesSchema = z.object({
  /** False when the Job's Cap has no `found` reader, or the Job left no report. */
  hasReader: z.boolean(),
  values: z.array(foundValueRecordSchema).max(FOUND_VALUES_MAX),
  /** Distinct values in the report, counted past the cut. */
  total: z.number().int().nonnegative(),
  isTruncated: z.boolean(),
});

export type FoundValueRecord = z.infer<typeof foundValueRecordSchema>;
export type JobFoundValues = z.infer<typeof jobFoundValuesSchema>;
