import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const networkUrlEnrichInput = z.object({
  url: httpUrlSchema.describe("URL to enrich"),
  sourceEvidenceId: optionalUuidSchema,
  entityId: optionalUuidSchema,
});
