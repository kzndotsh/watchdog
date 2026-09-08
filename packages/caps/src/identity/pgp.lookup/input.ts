import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const pgpLookupInput = z.object({
  query: nonEmptyTrimmed.describe("Email, fingerprint, or key id"),
  entityId: optionalUuidSchema,
});
