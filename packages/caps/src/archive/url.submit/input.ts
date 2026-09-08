import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const archiveUrlSubmitInput = z.object({
  url: httpUrlSchema.describe("URL to archive"),
  entityId: optionalUuidSchema,
});
