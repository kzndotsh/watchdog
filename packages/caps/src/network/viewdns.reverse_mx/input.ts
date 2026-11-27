import { z } from "zod";

import { hostSeedSchema } from "@watchdog/domain/schemas/caps";
import { optionalUuidSchema } from "@watchdog/domain/schemas/shared";

export const viewDnsReverseMxInput = z.object({
  host: hostSeedSchema.describe("Mail server"),
  entityId: optionalUuidSchema,
});
