import { z } from "zod";

import { trimmedCaseIdSchema } from "./ids";
import { jobInputObjectSchema } from "./job-input-display";
import { NAME_MAX } from "./limits";
import { pageInputFields } from "./pagination";
import { playbookSeedInputSchema } from "./playbook-seed";
import { requiredText, trimmedUuidSchema } from "./primitives";

export const listJobsInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  ...pageInputFields,
});

export const getJobInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  jobId: trimmedUuidSchema,
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

export type ListJobsInput = z.output<typeof listJobsInputSchema>;
export type GetJobInput = z.output<typeof getJobInputSchema>;
export type StartJobInput = z.output<typeof startJobInputSchema>;
export type CancelJobInput = z.output<typeof cancelJobInputSchema>;
export type RetryJobInput = z.output<typeof retryJobInputSchema>;
export type StartPlaybookInput = z.output<typeof startPlaybookInputSchema>;
export type CancelPlaybookInput = z.output<typeof cancelPlaybookInputSchema>;
