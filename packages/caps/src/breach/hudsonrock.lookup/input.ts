import { z } from "zod";

import { breachQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const hudsonrockLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email, IP, or domain"),
  entityId: optionalUuidSchema,
});
