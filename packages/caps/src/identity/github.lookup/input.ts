import { z } from "zod";

import { githubHandleSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const githubLookupInput = z.object({
  handle: githubHandleSeedSchema.describe("GitHub handle"),
  entityId: optionalUuidSchema,
});
