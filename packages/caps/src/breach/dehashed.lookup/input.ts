import { z } from "zod";

import { dehashedQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const dehashedLookupInput = z.object({
  query: dehashedQuerySeedSchema.describe(
    "Email, IP, domain, username, or freeform query"
  ),
  entityId: optionalUuidSchema,
});
