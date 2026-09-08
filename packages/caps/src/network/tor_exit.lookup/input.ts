import { z } from "zod";

import { ipSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const torExitLookupInput = z.object({
  ip: ipSeedSchema.describe("IPv4 or IPv6"),
  entityId: optionalUuidSchema,
});
