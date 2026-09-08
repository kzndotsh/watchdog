import { z } from "zod";

import { keybaseQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const keybaseLookupInput = z.object({
  query: keybaseQuerySeedSchema.describe("Keybase username or domain"),
  entityId: optionalUuidSchema,
});
