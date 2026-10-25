import { z } from "zod";

import { pgpQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const pgpLookupInput = z.object({
  query: pgpQuerySeedSchema.describe(
    "Email, domain (example.com or @example.com), name, key ID or fingerprint"
  ),
  entityId: optionalUuidSchema,
});
