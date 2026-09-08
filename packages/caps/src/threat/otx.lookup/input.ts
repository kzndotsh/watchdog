import { z } from "zod";

import { iocIndicatorSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const otxLookupInput = z.object({
  query: iocIndicatorSeedSchema.describe("IP, domain, URL, or file hash"),
  entityId: optionalUuidSchema,
});
