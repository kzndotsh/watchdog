import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const tlsAuditInput = z.object({
  host: nonEmptyTrimmed.describe("Host"),
  port: z.number().int().positive().optional().describe("Port"),
  entityId: optionalUuidSchema,
});
