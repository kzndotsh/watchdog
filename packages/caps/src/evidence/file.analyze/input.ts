import { z } from "zod";

import {
  optionalUuidSchema,
  trimmedUuidSchema,
} from "@watchdog/domain/schemas/shared";

export const fileAnalyzeInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
});
