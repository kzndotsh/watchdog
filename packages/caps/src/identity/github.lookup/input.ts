import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const githubLookupInput = z.object({
  handle: nonEmptyTrimmed.describe("GitHub handle"),
  entityId: optionalUuidSchema,
});
