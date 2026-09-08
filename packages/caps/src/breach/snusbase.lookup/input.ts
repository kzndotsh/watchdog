import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const snusbaseLookupInput = z.object({
  query: nonEmptyTrimmed.describe("Email, IP, domain, or username"),
  entityId: optionalUuidSchema,
});
