import { z } from "zod";

import type { JsonValue } from "./json";

/*
 * JSON as it is stored and as it leaves the API: no maximums. Reading a row that is already in
 * the database must not fail because a limit was introduced later (a history snapshot with
 * 1001 Evidence ids, a Job input saved before the limits). Input schemas use the bounded
 * `inputJsonValueSchema` / `inputJsonObjectSchema` (`primitives.ts`) instead.
 */
export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ])
);

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema);
