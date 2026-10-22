import { z } from "zod";

import {
  listCapabilitiesEffect,
  listPlaybookDescriptorsEffect,
} from "@watchdog/core/caps";
import {
  jsonObjectSchema,
  PLAYBOOK_SEED_KINDS,
} from "@watchdog/schemas/shared";

import { authed } from "../os";
import { runApp } from "../runtime";

const capIoKindSchema = z.object({
  kind: z.string(),
  type: z.string().optional(),
  evidenceKind: z.string().optional(),
});

const credentialSpecSchema = z.union([
  z.object({
    name: z.string(),
    optional: z.boolean().optional(),
  }),
  z.object({
    anyOf: z.array(z.string()).min(1),
  }),
]);

const jobPolicySchema = z.object({
  needsEvidenceSnapshot: z.boolean().optional(),
  linkEvidenceFromInput: z
    .array(z.enum(["evidenceId", "sourceEvidenceId"]))
    .optional(),
  markEvidenceProcessed: z.boolean().optional(),
  cacheTtlMs: z.number().optional(),
});

const providerSchema = z.object({
  name: z.string(),
  url: z.string(),
  termsUrl: z.string(),
  tier: z.enum(["free", "freemium", "paid", "self"]),
  commercialUse: z.enum(["allowed", "restricted", "forbidden", "unknown"]),
  attribution: z.object({ text: z.string(), url: z.string() }).optional(),
});

const disabledReasonSchema = z.enum(["breach_disabled"]);

const capabilitySchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
  provider: providerSchema,
  description: z.string().optional(),
  dataSource: z.string().optional(),
  kind: z.string().optional(),
  flags: z.array(z.string()).optional(),
  egress: z.string(),
  consumes: z.array(capIoKindSchema).optional(),
  produces: z.array(capIoKindSchema).optional(),
  useCases: z.array(z.string()).optional(),
  credentials: z.array(credentialSpecSchema).optional(),
  timeoutMs: z.number().optional(),
  jobPolicy: jobPolicySchema.optional(),
  disabledReason: disabledReasonSchema.optional(),
  input: jsonObjectSchema,
  inputForm: jsonObjectSchema,
});

const playbookRequiresSchema = z.object({
  credentials: z.array(credentialSpecSchema),
  egress: z.string(),
  flags: z.array(z.string()),
});

const playbookSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  seedKinds: z.array(z.enum(PLAYBOOK_SEED_KINDS)),
  steps: z.array(z.string()),
  /** Per step, the earlier steps it reads from (transitively), ascending. */
  stepDependencies: z.array(z.array(z.number().int().nonnegative())),
  requires: playbookRequiresSchema,
  disabledReason: disabledReasonSchema.optional(),
});

export const list = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/capabilities",
    summary: "List registered Capabilities (CapDescriptor catalog)",
    tags: ["capabilities"],
  })
  .output(z.array(capabilitySchema))
  .handler(async () => runApp(listCapabilitiesEffect()));

export const listPlaybooksProc = authed
  .meta({ scope: "cases:read" })
  .route({
    method: "GET",
    path: "/playbooks",
    summary: "List Cap playbooks (curated Cap chains)",
    tags: ["capabilities"],
  })
  .output(z.array(playbookSchema))
  .handler(async () => runApp(listPlaybookDescriptorsEffect()));
