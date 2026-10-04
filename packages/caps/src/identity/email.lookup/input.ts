import { z } from "zod";

import { emailSeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";

export const emailLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
