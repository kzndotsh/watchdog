import { z } from "zod";

import { ipOrHostSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const mnemonicLookupInput = z.object({
  query: ipOrHostSeedSchema.describe("IP or domain"),
  entityId: optionalUuidSchema,
});
