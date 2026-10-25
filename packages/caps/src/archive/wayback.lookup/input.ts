import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas/shared";

import {
  AFTER_BEFORE_MESSAGE,
  afterNotLaterThanBefore,
  waybackAfterSchema,
  waybackBeforeSchema,
} from "../bounds";

export const waybackLookupInput = z
  .object({
    url: httpUrlSchema.describe("URL"),
    entityId: optionalUuidSchema,
    /** Rows to list per run (versions when `distinctOnly`, else captures). */
    limit: z.number().int().positive().max(100).optional(),
    distinctOnly: z
      .boolean()
      .default(true)
      .describe(
        "Distinct versions only (skip captures with unchanged content)"
      ),
    after: waybackAfterSchema,
    before: waybackBeforeSchema,
    allStatuses: z
      .boolean()
      .optional()
      .describe("Include captures whose status is not 200 (redirects, errors)"),
    /** From a previous run's report: continues after the last row it listed. */
    resumeKey: z.string().trim().min(1).max(512).optional(),
  })
  .refine(afterNotLaterThanBefore, {
    message: AFTER_BEFORE_MESSAGE,
    path: ["after"],
  });
