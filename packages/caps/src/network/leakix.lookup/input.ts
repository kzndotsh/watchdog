import { z } from "zod";

import { ipOrHostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const leakixLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or host"),
  entityId: optionalUuidSchema,
});
