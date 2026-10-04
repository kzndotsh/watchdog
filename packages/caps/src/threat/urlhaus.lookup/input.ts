import { z } from "zod";

import { urlhausQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const urlhausLookupInput = z.object({
  query: urlhausQuerySeedSchema.describe(
    "URL, host, or file hash (MD5/SHA256)"
  ),
  entityId: optionalUuidSchema,
});
