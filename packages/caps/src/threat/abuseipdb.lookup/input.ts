import { z } from "zod";

import { ipSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const abuseIpdbLookupInput = z.object({
  ip: ipSeedSchema.describe("IPv4 or IPv6"),
  entityId: optionalUuidSchema,
});
