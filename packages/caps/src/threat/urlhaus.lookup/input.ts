import { z } from "zod";

import { nonEmptyTrimmed, optionalUuidSchema } from "@watchdog/schemas";

export const urlhausLookupInput = z.object({
  query: nonEmptyTrimmed.describe("URL, host, or file hash (MD5/SHA256)"),
  entityId: optionalUuidSchema,
});
