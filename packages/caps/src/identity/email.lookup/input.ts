import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const emailLookupInput = z.object({
  email: nonEmptyTrimmed.describe("Email"),
  entityId: optionalUuidSchema,
});
