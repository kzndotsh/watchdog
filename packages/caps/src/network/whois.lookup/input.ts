import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const whoisLookupInput = z.object({
  host: nonEmptyTrimmed.describe("Domain"),
  entityId: optionalUuidSchema,
});
