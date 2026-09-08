import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const keybaseLookupInput = z.object({
  query: nonEmptyTrimmed.describe("Keybase username or domain"),
  entityId: optionalUuidSchema,
});
