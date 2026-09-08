import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const httpProbeInput = z.object({
  host: nonEmptyTrimmed.describe("Host"),
  entityId: optionalUuidSchema,
});
