import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas/shared";

export const mediaOembedInput = z.object({
  url: httpUrlSchema.describe("Media URL"),
  entityId: optionalUuidSchema,
});
