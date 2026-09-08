import { z } from "zod";

import { jobInputObjectSchema } from "./job-input-display";
import { playbookSeedInputSchema } from "./playbook-seed";
import { nonEmptyTrimmed, trimmedUuidSchema } from "./primitives";

export const listJobsInputSchema = z.object({
  caseId: trimmedUuidSchema,
});

export const getJobInputSchema = z.object({
  caseId: trimmedUuidSchema,
  jobId: trimmedUuidSchema,
});

export const startJobInputSchema = z.object({
  caseId: trimmedUuidSchema,
  capabilityId: nonEmptyTrimmed,
  input: jobInputObjectSchema,
});

export const cancelJobInputSchema = z.object({
  caseId: trimmedUuidSchema,
  jobId: trimmedUuidSchema,
});

export const startPlaybookInputSchema = z.object({
  caseId: trimmedUuidSchema,
  playbookId: nonEmptyTrimmed,
  seed: playbookSeedInputSchema,
});

export const cancelPlaybookInputSchema = z.object({
  caseId: trimmedUuidSchema,
  playbookRunId: trimmedUuidSchema,
});

export type ListJobsInput = z.output<typeof listJobsInputSchema>;
export type GetJobInput = z.output<typeof getJobInputSchema>;
export type StartJobInput = z.output<typeof startJobInputSchema>;
export type CancelJobInput = z.output<typeof cancelJobInputSchema>;
export type StartPlaybookInput = z.output<typeof startPlaybookInputSchema>;
export type CancelPlaybookInput = z.output<typeof cancelPlaybookInputSchema>;
