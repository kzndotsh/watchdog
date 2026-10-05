import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { jobInputObjectSchema } from "./job-input-display";
import { playbookSeedInputSchema } from "./playbook-seed";
import { nonEmptyTrimmed, trimmedUuidSchema } from "./primitives";

export const listJobsInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
});

export const getJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
});

export const startJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  capabilityId: nonEmptyTrimmed,
  input: jobInputObjectSchema,
});

export const cancelJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
});

export const startPlaybookInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  playbookId: nonEmptyTrimmed,
  seed: playbookSeedInputSchema,
});

export const cancelPlaybookInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  playbookRunId: trimmedUuidSchema,
});

export type ListJobsInput = z.output<typeof listJobsInputSchema>;
export type GetJobInput = z.output<typeof getJobInputSchema>;
export type StartJobInput = z.output<typeof startJobInputSchema>;
export type CancelJobInput = z.output<typeof cancelJobInputSchema>;
export type StartPlaybookInput = z.output<typeof startPlaybookInputSchema>;
export type CancelPlaybookInput = z.output<typeof cancelPlaybookInputSchema>;
