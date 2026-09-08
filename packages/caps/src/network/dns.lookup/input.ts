import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const dnsLookupInput = z.object({
  host: nonEmptyTrimmed.describe("Host"),
  entityId: optionalUuidSchema,
});
