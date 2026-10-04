import { z } from "zod";

import { hostSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const commoncrawlLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
});
