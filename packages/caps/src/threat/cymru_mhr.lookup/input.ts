import { z } from "zod";

import { hashSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const cymruMhrLookupInput = z.object({
  hash: hashSeedSchema.describe("MD5, SHA-1, or SHA-256 hex hash"),
  entityId: optionalUuidSchema,
});
