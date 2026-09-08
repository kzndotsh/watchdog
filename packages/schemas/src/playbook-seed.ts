import { z } from "zod";

import {
  optionalHttpUrlSchema,
  optionalTrimmedSchema,
  optionalUuidSchema,
} from "./primitives";

export const playbookSeedInputSchema = z
  .object({
    host: optionalTrimmedSchema,
    url: optionalHttpUrlSchema,
    evidenceId: optionalUuidSchema,
    entityId: optionalUuidSchema,
    ip: optionalTrimmedSchema,
    email: optionalTrimmedSchema,
    hash: optionalTrimmedSchema,
    handle: optionalTrimmedSchema,
  })
  .refine(
    (seed) =>
      seed.host !== undefined ||
      seed.url !== undefined ||
      seed.evidenceId !== undefined ||
      seed.entityId !== undefined ||
      seed.ip !== undefined ||
      seed.email !== undefined ||
      seed.hash !== undefined ||
      seed.handle !== undefined,
    { message: "At least one playbook seed field is required" }
  );

export type PlaybookSeedInput = z.output<typeof playbookSeedInputSchema>;
