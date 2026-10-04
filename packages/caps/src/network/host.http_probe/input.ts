import { z } from "zod";

import { hostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const httpProbeInput = z.object({
  host: hostSeedSchema.describe("Host"),
  entityId: optionalUuidSchema,
});
