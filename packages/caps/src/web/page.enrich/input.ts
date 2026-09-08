import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const pageEnrichInput = z.object({
  url: httpUrlSchema.describe("URL"),
  entityId: optionalUuidSchema,
});
