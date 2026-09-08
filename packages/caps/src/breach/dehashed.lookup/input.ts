import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const dehashedLookupInput = z.object({
  query: nonEmptyTrimmed.describe(
    "Email, IP, domain, username, or freeform query"
  ),
  entityId: optionalUuidSchema,
});
