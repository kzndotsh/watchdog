import { z } from "zod";

import { keybaseQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const keybaseLookupInput = z.object({
  query: keybaseQuerySeedSchema.describe("Keybase username or domain"),
  entityId: optionalUuidSchema,
});
