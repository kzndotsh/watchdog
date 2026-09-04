import { Effect } from "effect";
import { z } from "zod";

import { listCapabilities, listPlaybookDescriptors } from "@watchdog/caps";
import { mapDomainCatch } from "@watchdog/core";
import { jsonObjectSchema, PLAYBOOK_SEED_KINDS } from "@watchdog/schemas";

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

const capabilitySchema = z.object({
  id: z.string(),
  version: z.string(),
  title: z.string(),
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
  requires: playbookRequiresSchema,
});

export const list = authed
  .route({
    method: "GET",
    path: "/capabilities",
    summary: "List registered Capabilities (CapDescriptor catalog)",
    tags: ["capabilities"],
  })
  .output(z.array(capabilitySchema))
  .handler(async () =>
    runApp(
      Effect.tryPromise({
        try: async () => listCapabilities(),
        catch: mapDomainCatch,
      })
    )
  );

export const listPlaybooksProc = authed
  .route({
    method: "GET",
    path: "/playbooks",
    summary: "List Cap playbooks (curated Cap chains)",
    tags: ["capabilities"],
  })
  .output(z.array(playbookSchema))
  .handler(async () =>
    runApp(
      Effect.tryPromise({
        try: async () => listPlaybookDescriptors(),
        catch: mapDomainCatch,
      })
    )
  );
