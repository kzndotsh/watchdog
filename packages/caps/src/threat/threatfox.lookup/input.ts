import { z } from "zod";

import { threatfoxQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const threatfoxLookupInput = z.object({
  query: threatfoxQuerySeedSchema.describe("IP, domain, or IOC string"),
  entityId: optionalUuidSchema,
});
