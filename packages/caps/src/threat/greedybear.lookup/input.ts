import { z } from "zod";

import { ipOrHostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const greedybearLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or domain"),
  entityId: optionalUuidSchema,
});
