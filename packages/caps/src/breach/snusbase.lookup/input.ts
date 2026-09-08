import { z } from "zod";

import { breachQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const snusbaseLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email, IP, domain, or username"),
  entityId: optionalUuidSchema,
});
