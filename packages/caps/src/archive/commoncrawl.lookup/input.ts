import { z } from "zod";

import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const commoncrawlLookupInput = z.object({
  host: hostSeedSchema.describe("Domain"),
  entityId: optionalUuidSchema,
});
