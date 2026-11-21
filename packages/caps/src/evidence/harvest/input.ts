import { z } from "zod";

import {
  optionalUuidSchema,
  trimmedUuidSchema,
} from "@watchdog/domain/schemas/shared";

export const evidenceHarvestInput = z.object({
  evidenceId: trimmedUuidSchema.describe("Evidence id"),
  entityId: optionalUuidSchema,
});
