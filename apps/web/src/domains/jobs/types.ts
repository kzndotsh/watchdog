import { z } from "zod";

import {
  type cancelJobInputSchema,
  type cancelPlaybookInputSchema,
  type getJobInputSchema,
  type listJobsInputSchema,
  type startJobInputSchema,
  type startPlaybookInputSchema,
  sha256HexSchema,
  trimmedUuidSchema,
  type JsonObject,
  type JsonValue,
  type PlaybookSeedKind,
} from "@watchdog/schemas";

/** CapDescriptor wire shape from capabilities.list (serializable catalog). */
export interface CapConsumeItem {
  kind: string;
  type?: string;
  evidenceKind?: string;
}

export interface CapListItem {
  id: string;
  version: string;
  title: string;
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
  jobPolicy?: {
    needsEvidenceSnapshot?: boolean;
    linkEvidenceFromInput?: ("evidenceId" | "sourceEvidenceId")[];
    markEvidenceProcessed?: boolean;
    cacheTtlMs?: number;
  };
  input: JsonObject;
  inputForm: JsonObject;
}

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
export interface PlaybookListItem {
  id: string;
  title: string;
  description: string;
  seedKinds: PlaybookSeedKind[];
  steps: string[];
  requires: {
    credentials: ({ name: string; optional?: boolean } | { anyOf: string[] })[];
    egress: string;
    flags: string[];
  };
}

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
