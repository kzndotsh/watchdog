import { z } from "zod";

import { hashSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const cymruMhrLookupInput = z.object({
  hash: hashSeedSchema.describe("MD5, SHA-1, or SHA-256 hex hash"),
  entityId: optionalUuidSchema,
});
