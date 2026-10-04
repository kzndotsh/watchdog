import { z } from "zod";

import { hostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const c99LookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
  /** Instant scan — slower / more credit-heavy. Default false. */
  realtime: z.boolean().optional(),
});
