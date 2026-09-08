import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const xforceLookupInput = z.object({
  query: nonEmptyTrimmed.describe("IP, domain, URL, or file hash"),
  entityId: optionalUuidSchema,
});
