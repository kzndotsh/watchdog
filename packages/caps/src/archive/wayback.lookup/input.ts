import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const waybackLookupInput = z.object({
  url: httpUrlSchema.describe("URL"),
  entityId: optionalUuidSchema,
  limit: z.number().int().positive().max(100).optional(),
});
