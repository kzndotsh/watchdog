import { z } from "zod";

import { urlhausQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const urlhausLookupInput = z.object({
  query: urlhausQuerySeedSchema.describe(
    "URL, host, or file hash (MD5/SHA256)"
  ),
  entityId: optionalUuidSchema,
});
