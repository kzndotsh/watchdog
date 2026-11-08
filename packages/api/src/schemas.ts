import { z } from "zod";

import { READINESS_REASONS } from "@watchdog/core/infra";

/** Agent ingress escape hatch — required as `true` for API-key child Graph writes. */
export const userOverrideSchema = z
  .literal(true)
  .optional()
  .describe("Required as true when authenticating with an API key.");

export const presignedUploadSchema = z.object({
  url: z.string(),
  uri: z.string(),
  sha256: z.string(),
  mime: z.string(),
  byteLength: z.number().int(),
  expiresIn: z.number().int(),
  headers: z.record(z.string(), z.string()),
});

export const credentialSlotSchema = z.object({
  name: z.string(),
  label: z.string(),
  description: z.string(),
  configured: z.boolean(),
  updatedAt: z.string().nullable(),
  breachDisabled: z.boolean(),
});

const dependencyStatusSchema = z.enum(["ok", ...READINESS_REASONS]);

export const readinessSchema = z.object({
  ok: z.boolean(),
  database: dependencyStatusSchema,
  storage: dependencyStatusSchema,
});
