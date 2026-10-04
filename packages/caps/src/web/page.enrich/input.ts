import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas/shared";

export const pageEnrichInput = z.object({
  url: httpUrlSchema.describe("URL"),
  entityId: optionalUuidSchema,
});
