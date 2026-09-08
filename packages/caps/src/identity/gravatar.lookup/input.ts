import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const gravatarLookupInput = z.object({
  email: nonEmptyTrimmed.describe("Email"),
  entityId: optionalUuidSchema,
});
