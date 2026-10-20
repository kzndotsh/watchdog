import { z } from "zod";

import {
  httpUrlSchema,
  NAME_MAX,
  optionalText,
  optionalUuidSchema,
} from "@watchdog/schemas/shared";

export const waybackFetchInput = z.object({
  url: httpUrlSchema.describe("URL"),
  /** CDX timestamp; when omitted, Cap resolves closest 200 via CDX. */
  timestamp: optionalText(NAME_MAX),
  entityId: optionalUuidSchema,
});
