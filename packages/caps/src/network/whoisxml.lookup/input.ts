import { z } from "zod";

import { hostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const whoisXmlLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
});
