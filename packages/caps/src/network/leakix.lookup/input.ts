import { z } from "zod";

import { ipOrHostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const leakixLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or host"),
  entityId: optionalUuidSchema,
});
