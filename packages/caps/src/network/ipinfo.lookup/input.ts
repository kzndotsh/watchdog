import { z } from "zod";

import { ipSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const ipinfoLookupInput = z.object({
  ip: ipSeedSchema.describe("IP address"),
  entityId: optionalUuidSchema,
});
