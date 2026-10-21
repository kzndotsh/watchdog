import { z } from "zod";

import {
  playbookRunOutcomeSchema,
  playbookRunStatusSchema,
  playbookStepStateSchema,
} from "./enums";
import { caseIdSchema, trimmedCaseIdSchema } from "./ids";
import { trimmedUuidSchema } from "./primitives";

export const getPlaybookRunInputSchema = z.object({
  caseId: trimmedCaseIdSchema,
  playbookRunId: trimmedUuidSchema,
});

/** One recipe step of a run: its outcome, why it failed or was skipped, and the Jobs that ran it. */
export const playbookRunStepSchema = z.object({
  step: z.number().int(),
  capabilityId: z.string(),
  state: playbookStepStateSchema,
  /** Present on a `skipped` step (`step N (<cap>) failed`) and on a `failed` step that never got a Job. */
  reason: z.string().optional(),
  /** The step's Jobs, oldest first: more than one after a fan-out or a retry. */
  jobIds: z.array(z.uuid()),
});

export const playbookRunSchema = z.object({
  id: z.uuid(),
  caseId: caseIdSchema,
  playbookId: z.string(),
  status: playbookRunStatusSchema,
  /** Set when the run finishes; null while it runs and when it was cancelled. */
  outcome: playbookRunOutcomeSchema.nullable(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  steps: z.array(playbookRunStepSchema),
});

export type GetPlaybookRunInput = z.output<typeof getPlaybookRunInputSchema>;
export type PlaybookRunStep = z.output<typeof playbookRunStepSchema>;
export type PlaybookRunView = z.output<typeof playbookRunSchema>;
