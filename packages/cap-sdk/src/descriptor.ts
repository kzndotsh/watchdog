import { z, type ZodType } from "zod";

import {
  isJsonObject,
  type JsonObject,
  type JsonValue,
} from "@watchdog/schemas";

import type {
  CapCredentialSpec,
  CapEgress,
  CapFlag,
  CapIoKind,
  CapJobPolicy,
  CapKind,
  CapabilityDef,
} from "./define";

const DEFAULT_FORM_OMIT = ["entityId"] as const;

/** Wire-safe credential specs (mutable arrays for JSON / OpenAPI). */
export type CapDescriptorCredential =
  | { name: string; optional?: boolean }
  | { anyOf: string[] };

/** Wire-safe jobPolicy (mutable arrays). */
export interface CapDescriptorJobPolicy {
  needsEvidenceSnapshot?: boolean;
  linkEvidenceFromInput?: ("evidenceId" | "sourceEvidenceId")[];
  markEvidenceProcessed?: boolean;
  cacheTtlMs?: number;
}

/**
 * Serializable Cap metadata — no run/interpret. Derived from CapabilityDef
 * via {@link toCapDescriptor}. Hand-editing capabilities.gen.json is forbidden.
 */
export interface CapDescriptor {
  id: string;
  version: string;
  title: string;
  description?: string;
  dataSource?: string;
  kind?: CapKind;
  flags?: CapFlag[];
  egress: CapEgress;
  consumes?: CapIoKind[];
  produces?: CapIoKind[];
  useCases?: string[];
  credentials?: CapDescriptorCredential[];
  timeoutMs?: number;
  jobPolicy?: CapDescriptorJobPolicy;
  /** Full input JSON Schema (from Zod). */
  input: JsonObject;
  /**
   * Form-facing schema: same as input minus formOmit keys
   * (default entityId; Cap may list more e.g. model, sourceEvidenceId).
   */
  inputForm: JsonObject;
}

function asJsonObject(value: unknown): JsonObject {
  if (!isJsonObject(value)) {
    throw new Error("Expected JSON Schema object");
  }
  return value;
}

function omitFormKeys(
  schema: JsonObject,
  omitKeys: readonly string[]
): JsonObject {
  if (omitKeys.length === 0) return structuredClone(schema);

  const next = structuredClone(schema);
  const props = next.properties;
  if (typeof props === "object" && props !== null && !Array.isArray(props)) {
    const record = props as Record<string, JsonValue>;
    next.properties = Object.fromEntries(
      Object.entries(record).filter(([key]) => !omitKeys.includes(key))
    );
  }

  const required = next.required;
  if (Array.isArray(required)) {
    next.required = required.filter(
      (k): k is string => typeof k === "string" && !omitKeys.includes(k)
    );
  }

  return next;
}

function serializeJobPolicy(
  policy: CapJobPolicy | undefined
): CapDescriptorJobPolicy | undefined {
  if (!policy) return undefined;
  const out: CapDescriptorJobPolicy = {};
  if (policy.needsEvidenceSnapshot !== undefined) {
    out.needsEvidenceSnapshot = policy.needsEvidenceSnapshot;
  }
  if (policy.markEvidenceProcessed !== undefined) {
    out.markEvidenceProcessed = policy.markEvidenceProcessed;
  }
  if (policy.cacheTtlMs !== undefined) {
    out.cacheTtlMs = policy.cacheTtlMs;
  }
  if (policy.linkEvidenceFromInput) {
    out.linkEvidenceFromInput = [...policy.linkEvidenceFromInput];
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function serializeCredentials(
  credentials: readonly CapCredentialSpec[] | undefined
): CapDescriptorCredential[] | undefined {
  if (!credentials?.length) return undefined;
  return credentials.map((spec) => {
    if ("anyOf" in spec) {
      return { anyOf: [...spec.anyOf] };
    }
    return {
      name: spec.name,
      ...(spec.optional === true ? { optional: true } : {}),
    };
  });
}

/**
 * Project a CapabilityDef into a JSON-serializable CapDescriptor.
 * Uses Zod 4 `z.toJSONSchema` for input / inputForm.
 */
export function toCapDescriptor<TSchema extends ZodType>(
  def: CapabilityDef<TSchema>
): CapDescriptor {
  const formOmit = def.formOmit ?? DEFAULT_FORM_OMIT;
  const input = asJsonObject(z.toJSONSchema(def.input));
  const inputForm = omitFormKeys(input, formOmit);

  const descriptor: CapDescriptor = {
    id: def.id,
    version: def.version ?? "1",
    title: def.title,
    egress: def.egress ?? "none",
    input,
    inputForm,
  };

  if (def.description !== undefined) descriptor.description = def.description;
  if (def.dataSource !== undefined) descriptor.dataSource = def.dataSource;
  if (def.kind !== undefined) descriptor.kind = def.kind;
  if (def.flags !== undefined) descriptor.flags = [...def.flags];
  if (def.consumes !== undefined) descriptor.consumes = [...def.consumes];
  if (def.produces !== undefined) descriptor.produces = [...def.produces];
  if (def.useCases !== undefined) descriptor.useCases = [...def.useCases];
  if (def.timeoutMs !== undefined) descriptor.timeoutMs = def.timeoutMs;

  const jobPolicy = serializeJobPolicy(def.jobPolicy);
  if (jobPolicy) descriptor.jobPolicy = jobPolicy;

  const credentials = serializeCredentials(def.credentials);
  if (credentials) descriptor.credentials = credentials;

  return descriptor;
}
