import { z } from "zod";

import {
  optionalUuidSchema,
  trimmedUuidSchema,
} from "@watchdog/domain/schemas/shared";

export const emlAnalyzeInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
});
