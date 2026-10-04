import { z } from "zod";

import { hashSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const hashlookupLookupInput = z.object({
  hash: hashSeedSchema.describe("MD5, SHA-1, SHA-256, or SHA-512 hex hash"),
  entityId: optionalUuidSchema,
});
