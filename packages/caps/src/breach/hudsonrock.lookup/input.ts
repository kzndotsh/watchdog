import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const hudsonrockLookupInput = z.object({
  query: nonEmptyTrimmed.describe("Email, IP, or domain"),
  entityId: optionalUuidSchema,
});
