import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const txtInventoryInput = z.object({
  host: nonEmptyTrimmed.describe("Domain"),
  entityId: optionalUuidSchema,
});
