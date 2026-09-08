import { z } from "zod";

import { emailSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const emailrepLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
