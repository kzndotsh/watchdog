import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const greedybearLookupInput = z.object({
  query: nonEmptyTrimmed.describe("IP or domain"),
  entityId: optionalUuidSchema,
});
