import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { jobInputObjectSchema } from "./job-input-display";
import { NAME_MAX } from "./limits";
import { playbookSeedInputSchema } from "./playbook-seed";
import { requiredText, sha256HexSchema, trimmedUuidSchema } from "./primitives";

export const getJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
});

/** One of a Job's output artifacts, named by its content hash (`jobs.artifactText`). */
export const getJobArtifactTextInputSchema = getJobInputSchema.extend({
  sha256: sha256HexSchema,
});

export const startJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  capabilityId: requiredText(NAME_MAX),
  input: jobInputObjectSchema,
});

export const cancelJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
});

export const retryJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
});

export const startPlaybookInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  playbookId: requiredText(NAME_MAX),
  seed: playbookSeedInputSchema,
});

export const cancelPlaybookInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  playbookRunId: trimmedUuidSchema,
});

export type GetJobInput = z.output<typeof getJobInputSchema>;
export type StartJobInput = z.output<typeof startJobInputSchema>;
export type CancelJobInput = z.output<typeof cancelJobInputSchema>;
export type RetryJobInput = z.output<typeof retryJobInputSchema>;
export type StartPlaybookInput = z.output<typeof startPlaybookInputSchema>;
export type CancelPlaybookInput = z.output<typeof cancelPlaybookInputSchema>;
