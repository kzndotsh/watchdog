import { z } from "zod";

import { emailSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const emailLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
