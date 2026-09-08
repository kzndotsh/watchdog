import { z } from "zod";

import { httpUrlSchema, optionalUuidSchema } from "@watchdog/schemas";

export const safebrowsingLookupInput = z.object({
  url: httpUrlSchema.describe("URL"),
  entityId: optionalUuidSchema,
});
