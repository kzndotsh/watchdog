import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const commoncrawlLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
});
