import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const c99LookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
  /** Instant scan — slower / more credit-heavy. Default false. */
  realtime: z.boolean().optional(),
});
