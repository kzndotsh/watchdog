import { z } from "zod";

import { urlhausQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const urlhausLookupInput = z.object({
  query: urlhausQuerySeedSchema.describe(
    "URL, host, or file hash (MD5/SHA256)"
  ),
  entityId: optionalUuidSchema,
});
