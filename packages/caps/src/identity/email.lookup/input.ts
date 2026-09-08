import { z } from "zod";

import { emailSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const emailLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
