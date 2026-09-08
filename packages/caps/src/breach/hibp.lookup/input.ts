import { z } from "zod";

import { emailSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const hibpLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
