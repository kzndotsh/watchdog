import { z } from "zod";

import {
  httpUrlSchema,
  optionalTrimmedSchema,
  optionalUuidSchema,
} from "@watchdog/schemas";

export const waybackFetchInput = z.object({
  url: httpUrlSchema.describe("URL"),
  /** CDX timestamp; when omitted, Cap resolves closest 200 via CDX. */
  timestamp: optionalTrimmedSchema,
  entityId: optionalUuidSchema,
});
