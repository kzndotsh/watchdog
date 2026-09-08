import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const urlUnshortenInput = z.object({
  url: httpUrlSchema.describe("URL"),
  entityId: optionalUuidSchema,
});
