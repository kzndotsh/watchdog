import { z } from "zod";

import {
  optionalTrimmedSchema,
  optionalUuidSchema,
  trimmedUuidSchema,
} from "@watchdog/schemas/shared";

export const evidenceExtractAiInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
  model: optionalTrimmedSchema,
});
