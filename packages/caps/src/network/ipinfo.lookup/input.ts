import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const ipinfoLookupInput = z.object({
  ip: nonEmptyTrimmed.describe("IP address"),
  entityId: optionalUuidSchema,
});
