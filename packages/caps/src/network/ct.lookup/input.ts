import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const ctLookupInput = z.object({
  host: hostSeedSchema.describe("Host"),
  entityId: optionalUuidSchema,
  /** Max CRT rows to retain (default 50). */
  limit: z.number().int().min(1).max(200).optional(),
});
