import { z } from "zod";

import { emailSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const hibpLookupInput = z.object({
  email: emailSeedSchema.describe("Email"),
  entityId: optionalUuidSchema,
});
