import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const urlscanLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
});
