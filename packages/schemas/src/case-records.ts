import { z } from "zod";

import { egressClassSchema } from "./egress-class";
import { caseIdSchema } from "./ids";
import { listPageSchema, listTotalSchema } from "./lists/list-page";

export const caseSchema = z.object({
  id: caseIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  /** The egress classes the Case allows; `local` is always one. */
  allowedEgress: z.array(egressClassSchema),
});

/** A restored Case; `previousSlug` is set when its old link was taken and it got a new one. */
export const restoredCaseSchema = caseSchema.extend({
  previousSlug: z.string().nullable(),
});

/** A deleted Case as Deleted Cases lists it (owners and admins only). */
export const deletedCaseSchema = z.object({
  id: caseIdSchema,
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  deletedAt: z.string(),
  deletedById: z.string().nullable(),
  /** Display name of `deletedById`; null when unknown or the user is gone. */
  deletedByName: z.string().nullable(),
  /** When the scheduled purge takes the Case (the end of the restore window). */
  purgeAt: z.string(),
  /** Whole days left to restore it; 0 once the window has passed. */
  daysLeft: z.number().int().min(0),
  /** A purge has begun: the Case can no longer be restored, only purged. */
  purging: z.boolean(),
  /** The last purge attempt's failure; the scheduled purge retries it. */
  purgeError: z.string().nullable(),
});

export const deletionPolicySchema = z.object({
  /** Days a deleted Case stays restorable before the scheduled purge erases it. */
  restoreWindowDays: z.number().int().min(1),
  /** The caller is an owner or admin: they may delete, restore and purge Cases. */
  canManage: z.boolean(),
  /** With a `caseId`: queued and running Jobs a delete of it would cancel. */
  cancellableJobs: z.number().int().min(0),
  /** The caller is an owner or admin and the instance runs `WD_BREACH_CAPS=full`: an Export may include breach credentials. */
  canIncludeBreachCredentials: z.boolean(),
});

/** A tile count: exact below the cap, `count` equal to the cap and `isCapped` above it (like a list's `total`). */
export const caseCountsSchema = z.object({
  entities: listTotalSchema,
  identifiers: listTotalSchema,
  connections: listTotalSchema,
  /** Visible Evidence: the Evidence list's default view, not the hidden rows. */
  evidence: listTotalSchema,
  /** Live Jobs (queued or running): a playbook run counts once, however many of its steps are live. */
  liveJobs: listTotalSchema,
  /** Open Tasks due before the caller's day start. */
  tasksOverdue: listTotalSchema,
  /** Open Tasks due from the caller's day start through the next 7 calendar days. */
  tasksDueSoon: listTotalSchema,
});

export const casePageSchema = listPageSchema(caseSchema);
export const deletedCasesPageSchema = listPageSchema(deletedCaseSchema);
