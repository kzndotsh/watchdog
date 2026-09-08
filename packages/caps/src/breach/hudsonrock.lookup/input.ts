import { z } from "zod";

import { breachQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const hudsonrockLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email, IP, or domain"),
  entityId: optionalUuidSchema,
});
