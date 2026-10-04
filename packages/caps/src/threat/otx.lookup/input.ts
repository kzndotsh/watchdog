import { z } from "zod";

import { iocIndicatorSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const otxLookupInput = z.object({
  query: iocIndicatorSeedSchema.describe("IP, domain, URL, or file hash"),
  entityId: optionalUuidSchema,
});
