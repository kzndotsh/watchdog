import { z } from "zod";

import { optionalUuidSchema, trimmedUuidSchema } from "@watchdog/schemas";

export const emlAnalyzeInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
});
