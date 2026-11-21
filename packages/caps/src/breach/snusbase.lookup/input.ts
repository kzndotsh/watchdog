import { z } from "zod";

import { breachQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const snusbaseLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email, IP, domain, or username"),
  entityId: optionalUuidSchema,
});
