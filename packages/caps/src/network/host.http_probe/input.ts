import { z } from "zod";

import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const httpProbeInput = z.object({
  host: hostSeedSchema.describe("Host"),
  entityId: optionalUuidSchema,
});
