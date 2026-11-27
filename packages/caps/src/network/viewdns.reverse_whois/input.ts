import { z } from "zod";

import { reverseWhoisQuerySeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const viewDnsReverseWhoisInput = z.object({
  query: reverseWhoisQuerySeedSchema.describe(
    "Registrant email, person name or organization (5 to 256 characters)"
  ),
  entityId: optionalUuidSchema,
});
