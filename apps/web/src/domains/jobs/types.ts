import { z } from "zod";

import type {
  cancelJobInputSchema,
  cancelPlaybookInputSchema,
  getJobInputSchema,
  listJobsInputSchema,
  startJobInputSchema,
  startPlaybookInputSchema,
} from "@watchdog/schemas/jobs";
import {
  sha256HexSchema,
  trimmedUuidSchema,
  type JsonObject,
  type JsonValue,
  type PlaybookSeedKind,
} from "@watchdog/schemas/shared";

/** CapDescriptor wire shape from capabilities.list (serializable catalog). */
export type CapConsumeItem = {
  kind: string;
  type?: string;
  evidenceKind?: string;
};

/** A Cap's data provider and the terms it was read from (the register's source). */
export type CapProviderInfo = {
  name: string;
  url: string;
  termsUrl: string;
  tier: "free" | "freemium" | "paid" | "self";
  commercialUse: "allowed" | "restricted" | "forbidden" | "unknown";
  /** Set only when the provider's terms require credit. */
  attribution?: { text: string; url: string };
};

export type CapListItem = {
  id: string;
  version: string;
  title: string;
  provider: CapProviderInfo;
  description?: string;
  dataSource?: string;
  kind?: string;
  flags?: string[];
  egress: string;
  consumes?: CapConsumeItem[];
  produces?: {
    kind: string;
    type?: string;
    evidenceKind?: string;
  }[];
  useCases?: string[];
  credentials?: ({ name: string; optional?: boolean } | { anyOf: string[] })[];
  timeoutMs?: number;
  /** Set while an operator setting keeps the Cap from running (`WD_ENABLE_BREACH_CAPS` off). */
  disabledReason?: "breach_disabled";
  jobPolicy?: {
    needsEvidenceSnapshot?: boolean;
    linkEvidenceFromInput?: ("evidenceId" | "sourceEvidenceId")[];
    markEvidenceProcessed?: boolean;
    cacheTtlMs?: number;
  };
  input: JsonObject;
  inputForm: JsonObject;
};

export function inputFormProperties(
  inputForm: JsonObject | undefined
): Record<string, JsonValue> | undefined {
  const props = inputForm?.properties;
  if (typeof props !== "object" || props === null || Array.isArray(props)) {
    return undefined;
  }
  return props;
}

export type ListJobsInput = z.output<typeof listJobsInputSchema>;

export type GetJobInput = z.output<typeof getJobInputSchema>;

export type StartJobInput = z.output<typeof startJobInputSchema>;

export type CancelJobInput = z.output<typeof cancelJobInputSchema>;

/** PlaybookDescriptor wire shape from capabilities.listPlaybooks. */
export type PlaybookListItem = {
  id: string;
  title: string;
  description: string;
  seedKinds: PlaybookSeedKind[];
  steps: string[];
  /** Per step, the earlier steps it reads from (transitively), ascending. */
  stepDependencies: number[][];
  requires: {
    credentials: ({ name: string; optional?: boolean } | { anyOf: string[] })[];
    egress: string;
    flags: string[];
  };
  /** Set while an operator setting keeps the Playbook from starting. */
  disabledReason?: "breach_disabled";
};

export type StartPlaybookInput = z.output<typeof startPlaybookInputSchema>;

export type CancelPlaybookInput = z.output<typeof cancelPlaybookInputSchema>;

const artifactMimeSchema = z
  .string()
  .optional()
  .transform((value) => value?.trim() ?? "");

/** Resolve blob keys server-side — never accept client-supplied storage URIs. */
export const getArtifactContentInputSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("job"),
    caseId: trimmedUuidSchema,
    jobId: trimmedUuidSchema,
    sha256: sha256HexSchema,
    mime: artifactMimeSchema,
  }),
  z.object({
    source: z.literal("evidence"),
    caseId: trimmedUuidSchema,
    evidenceId: trimmedUuidSchema,
    mime: artifactMimeSchema,
  }),
]);
export type GetArtifactContentInput = z.output<
  typeof getArtifactContentInputSchema
>;
