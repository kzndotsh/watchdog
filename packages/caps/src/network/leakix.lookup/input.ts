import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const leakixLookupInput = z.object({
  query: nonEmptyTrimmed.describe("IP or host"),
  entityId: optionalUuidSchema,
});
