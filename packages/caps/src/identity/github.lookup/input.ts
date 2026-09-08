import { z } from "zod";

import { githubHandleSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const githubLookupInput = z.object({
  handle: githubHandleSeedSchema.describe("GitHub handle"),
  entityId: optionalUuidSchema,
});
