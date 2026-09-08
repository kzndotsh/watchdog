import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const threatfoxLookupInput = z.object({
  query: nonEmptyTrimmed.describe("IP, domain, or IOC string"),
  entityId: optionalUuidSchema,
});
