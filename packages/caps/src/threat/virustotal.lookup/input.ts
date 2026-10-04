import { z } from "zod";

import { ipOrHostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const virusTotalLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or domain"),
  entityId: optionalUuidSchema,
});
