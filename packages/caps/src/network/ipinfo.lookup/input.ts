import { z } from "zod";

import { ipSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const ipinfoLookupInput = z.object({
  ip: ipSeedSchema.describe("IP address"),
  entityId: optionalUuidSchema,
});
