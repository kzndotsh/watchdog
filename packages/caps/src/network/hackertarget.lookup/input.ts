import { z } from "zod";

import { ipSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const hackertargetLookupInput = z.object({
  ip: ipSeedSchema.describe("IPv4 or IPv6"),
  entityId: optionalUuidSchema,
});
