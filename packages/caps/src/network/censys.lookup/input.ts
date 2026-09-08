import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const censysLookupInput = z.object({
  ip: nonEmptyTrimmed.describe("IPv4 or IPv6"),
  entityId: optionalUuidSchema,
});
