import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const c99LookupInput = z.object({
  host: nonEmptyTrimmed.describe("Domain"),
  entityId: optionalUuidSchema,
  /** Instant scan — slower / more credit-heavy. Default false. */
  realtime: z.boolean().optional(),
});
