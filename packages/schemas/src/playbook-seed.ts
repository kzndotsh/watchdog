import { z } from "zod";

import { NAME_MAX } from "./limits";
import {
  optionalHttpUrlSchema,
  optionalText,
  optionalUuidSchema,
} from "./primitives";

export const playbookSeedInputSchema = z
  .object({
    host: optionalText(NAME_MAX),
    url: optionalHttpUrlSchema,
    evidenceId: optionalUuidSchema,
    entityId: optionalUuidSchema,
    ip: optionalText(NAME_MAX),
    email: optionalText(NAME_MAX),
    hash: optionalText(NAME_MAX),
    handle: optionalText(NAME_MAX),
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
