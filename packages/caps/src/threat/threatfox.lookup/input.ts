import { z } from "zod";

import { threatfoxQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const threatfoxLookupInput = z.object({
  query: threatfoxQuerySeedSchema.describe("IP, domain, or IOC string"),
  entityId: optionalUuidSchema,
});
