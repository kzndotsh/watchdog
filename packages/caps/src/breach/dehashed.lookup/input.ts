import { z } from "zod";

import { dehashedQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const dehashedLookupInput = z.object({
  query: dehashedQuerySeedSchema.describe(
    "Email, IP, domain, username, or freeform query"
  ),
  entityId: optionalUuidSchema,
});
