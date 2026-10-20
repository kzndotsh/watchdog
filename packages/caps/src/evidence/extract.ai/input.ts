import { z } from "zod";

import {
  NAME_MAX,
  optionalText,
  optionalUuidSchema,
  trimmedUuidSchema,
} from "@watchdog/schemas/shared";

export const evidenceExtractAiInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
  model: optionalText(NAME_MAX),
});
