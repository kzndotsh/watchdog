import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const certspotterLookupInput = z.object({
  host: nonEmptyTrimmed.describe("Domain"),
  entityId: optionalUuidSchema,
});
