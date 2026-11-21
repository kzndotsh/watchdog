import { z } from "zod";

import { breachQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const hudsonrockLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email, IP, or domain"),
  entityId: optionalUuidSchema,
});
