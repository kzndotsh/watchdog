import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas/shared";

import {
  AFTER_BEFORE_MESSAGE,
  afterNotLaterThanBefore,
  waybackAfterSchema,
  waybackBeforeSchema,
} from "../bounds";

/** Fetches per run. Each one is a request to the Wayback Machine, so the ceiling is low. */
export const PAGE_HISTORY_DEFAULT_VERSIONS = 10;
const PAGE_HISTORY_MAX_VERSIONS = 25;

export const pageHistoryInput = z
  .object({
    url: httpUrlSchema.describe("URL"),
    entityId: optionalUuidSchema,
    after: waybackAfterSchema,
    before: waybackBeforeSchema,
    maxVersions: z
      .number()
      .int()
      .min(1)
      .max(PAGE_HISTORY_MAX_VERSIONS)
      .default(PAGE_HISTORY_DEFAULT_VERSIONS)
      .describe("Most distinct versions to fetch (oldest first)"),
  })
  .refine(afterNotLaterThanBefore, {
    message: AFTER_BEFORE_MESSAGE,
    path: ["after"],
  });
