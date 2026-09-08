import { z } from "zod";

import { emailSeedSchema, optionalUuidSchema } from "@watchdog/schemas";

export const gravatarLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
