import { z } from "zod";

import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const tlsAuditInput = z.object({
  host: hostSeedSchema.describe("Host"),
  port: z.number().int().positive().optional().describe("Port"),
  entityId: optionalUuidSchema,
});
