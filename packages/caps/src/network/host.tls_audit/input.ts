import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const tlsAuditInput = z.object({
  host: hostSeedSchema.describe("Host"),
  port: z.number().int().positive().optional().describe("Port"),
  entityId: optionalUuidSchema,
});
