import { z } from "zod";

import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const dnsLookupInput = z.object({
  host: hostSeedSchema.describe("Host"),
  entityId: optionalUuidSchema,
});
