import { z } from "zod";

import { breachQuerySeedSchema } from "@watchdog/schemas/caps";
import { optionalUuidSchema } from "@watchdog/schemas/shared";
import {
  LEAKRADAR_DEFAULT_PAGE_SIZE,
  LEAKRADAR_MAX_PAGE,
  LEAKRADAR_MAX_PAGE_SIZE,
  leakradarKindSchema,
} from "@watchdog/tools/breach";

export const leakradarLookupInput = z.object({
  query: breachQuerySeedSchema.describe("Email address, username or domain"),
  kind: leakradarKindSchema
    .optional()
    .describe(
      "Force the query kind; by default an address with @ is an email, a dotted name a domain and anything else a username"
    ),
  pageSize: z
    .number()
    .int()
    .min(1)
    .max(LEAKRADAR_MAX_PAGE_SIZE)
    .default(LEAKRADAR_DEFAULT_PAGE_SIZE)
    .describe("Masked records to read in one page"),
  page: z
    .number()
    .int()
    .min(1)
    .max(LEAKRADAR_MAX_PAGE)
    .default(1)
    .describe("Page of masked records (one request per run)"),
  includeRecords: z
    .boolean()
    .default(false)
    .describe(
      "Domain only: also read one page of masked records after the counts"
    ),
  entityId: optionalUuidSchema,
});
