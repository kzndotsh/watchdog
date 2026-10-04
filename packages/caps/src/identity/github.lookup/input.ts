import { z } from "zod";

import { githubHandleSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const githubLookupInput = z.object({
  handle: githubHandleSeedSchema.describe("GitHub handle"),
  entityId: optionalUuidSchema,
});
