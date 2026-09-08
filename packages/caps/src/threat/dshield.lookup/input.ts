import { z } from "zod";

import { ipSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const dshieldLookupInput = z.object({
  ip: ipSeedSchema.describe("IPv4 or IPv6"),
  entityId: optionalUuidSchema,
});
