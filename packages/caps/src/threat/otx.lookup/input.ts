import { z } from "zod";

import { iocIndicatorSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const otxLookupInput = z.object({
  query: iocIndicatorSeedSchema.describe("IP, domain, URL, or file hash"),
  entityId: optionalUuidSchema,
});
