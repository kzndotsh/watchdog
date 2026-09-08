import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const mailConfigInput = z.object({
  host: nonEmptyTrimmed.describe("Host"),
  entityId: optionalUuidSchema,
});
