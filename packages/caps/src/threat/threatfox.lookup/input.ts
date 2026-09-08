import { z } from "zod";

import {
  threatfoxQuerySeedSchema,
  optionalUuidSchema,
} from "@watchdog/schemas";

export const threatfoxLookupInput = z.object({
  query: threatfoxQuerySeedSchema.describe("IP, domain, or IOC string"),
  entityId: optionalUuidSchema,
});
