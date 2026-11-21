import { z } from "zod";

import { pgpQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const pgpLookupInput = z.object({
  query: pgpQuerySeedSchema.describe(
    "Email, domain (example.com or @example.com), name, key ID or fingerprint"
  ),
  entityId: optionalUuidSchema,
});
