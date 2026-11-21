import { z } from "zod";

import { ipSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const ipinfoLookupInput = z.object({
  ip: ipSeedSchema.describe("IP address"),
  entityId: optionalUuidSchema,
});
