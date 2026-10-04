import { z } from "zod";

import { ipOrHostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const leakixLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or host"),
  entityId: optionalUuidSchema,
});
