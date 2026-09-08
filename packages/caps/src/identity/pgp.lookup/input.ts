import { z } from "zod";

import { pgpQuerySeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const pgpLookupInput = z.object({
  query: pgpQuerySeedSchema.describe("Email, fingerprint, or key id"),
  entityId: optionalUuidSchema,
});
