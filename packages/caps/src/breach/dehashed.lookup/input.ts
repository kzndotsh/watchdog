import { z } from "zod";

import { dehashedQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const dehashedLookupInput = z.object({
  query: dehashedQuerySeedSchema.describe(
    "Email, IP, domain, username, or freeform query"
  ),
  entityId: optionalUuidSchema,
});
