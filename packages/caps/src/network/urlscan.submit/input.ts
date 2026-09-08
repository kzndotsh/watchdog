import { z } from "zod";

import {
  httpUrlSchema,
  optionalUuidSchema,
  trimmedOrUndefined,
} from "@watchdog/schemas";

const urlscanVisibilitySchema = z.enum(["public", "unlisted", "private"]);

export const urlscanSubmitInput = z.object({
  url: httpUrlSchema.describe("URL to scan"),
  entityId: optionalUuidSchema,
  /** OPSEC: default unlisted — public scans can leak investigation interest. */
  visibility: z.preprocess((value) => {
    if (value === undefined || typeof value !== "string") return value;
    const trimmed = trimmedOrUndefined(value);
    return trimmed?.toLowerCase();
  }, urlscanVisibilitySchema.optional()),
});
