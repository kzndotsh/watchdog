import { z } from "zod";

import { hostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const tlsAuditInput = z.object({
  host: hostSeedSchema.describe("Host"),
  port: z.number().int().positive().optional().describe("Port"),
  entityId: optionalUuidSchema,
});
