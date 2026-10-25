import { z, type ZodType } from "zod";

import {
  deriveEgressClasses,
  isThirdPartyEgress,
  type CapContact,
} from "@watchdog/schemas/caps";
import {
  isJsonObject,
  type EgressClass,
  type JsonObject,
  type JsonValue,
} from "@watchdog/schemas/shared";

import type {
  CapAuthoredFlag,
  CapCredentialSpec,
  CapFlag,
  CapIoKind,
  CapJobPolicy,
  CapKind,
  CapabilityDef,
} from "./define";
import type { CapProvider } from "./provider";

const DEFAULT_FORM_OMIT = ["entityId"] as const;

/** Cap input uses Zod transforms for normalization; JSON Schema uses input shape only. */
const CAP_INPUT_JSON_SCHEMA_OPTS = {
  unrepresentable: "any" as const,
  io: "input" as const,
};

/** Wire-safe credential specs (mutable arrays for JSON / OpenAPI). */
export type CapDescriptorCredential =
  | { name: string; optional?: boolean }
  | { anyOf: string[] };

/** Wire-safe jobPolicy (mutable arrays). */
export type CapDescriptorJobPolicy = {
  needsEvidenceSnapshot?: boolean;
  linkEvidenceFromInput?: ("evidenceId" | "sourceEvidenceId")[];
  markEvidenceProcessed?: boolean;
  cacheTtlMs?: number;
};

/**
 * Serializable Cap metadata — no run/interpret. Derived from CapabilityDef
 * via {@link toCapDescriptor}. Hand-editing capabilities.gen.json is forbidden.
 */
export type CapDescriptor = {
  id: string;
  /** Fingerprint of the code the Cap reaches (`pnpm generate:caps`); never authored. */
  version: string;
  title: string;
  provider: CapProvider;
  description?: string;
  dataSource?: string;
  kind?: CapKind;
  flags?: CapFlag[];
  /** Derived from `contacts` (`deriveEgressClasses`); never authored. */
  egress: EgressClass[];
  /** Who the Cap talks to, as declared. */
  contacts: CapContact[];
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
};

/** The id category of Caps that query breach and leak corpora about people (opt-in: `WD_BREACH_CAPS`). */
export const BREACH_CAP_CATEGORY = "breach";

/**
 * Whether a Cap is a breach Cap: the one predicate the register, the API, the availability
 * gates and the UI share. The category is the id's first segment, so a new Cap under
 * `breach/` is gated without a second declaration.
 */
export function isBreachCap(cap: { id: string }): boolean {
  return cap.id.split(".")[0] === BREACH_CAP_CATEGORY;
}

/**
 * The descriptor's flags: `needs_key`, `third_party` and `breach` are derived (a Cap states
 * credentials, egress and its id once), `slow` and `invasive` come from the Cap. A Cap whose
 * credentials are all optional does not need a key. Canonical order, no duplicates.
 */
export function deriveCapFlags(def: {
  id?: string;
  credentials?: readonly CapCredentialSpec[];
  contacts?: readonly CapContact[];
  flags?: readonly CapAuthoredFlag[];
}): CapFlag[] {
  const authored = new Set(def.flags);
  const needsKey = (def.credentials ?? []).some(
    (spec) => "anyOf" in spec || spec.optional !== true
  );
  const flags: CapFlag[] = [];
  if (needsKey) flags.push("needs_key");
  if (isThirdPartyEgress(deriveEgressClasses(def.contacts ?? []))) {
    flags.push("third_party");
  }
  if (authored.has("slow")) flags.push("slow");
  if (authored.has("invasive")) flags.push("invasive");
  if (def.id !== undefined && isBreachCap({ id: def.id })) flags.push("breach");
  return flags;
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
 * The descriptor without a version, for the callers that read a Cap's declared metadata (egress,
 * flags, credentials) and not the catalog. Uses Zod 4 `z.toJSONSchema` for input / inputForm.
 */
export function toCapMetadata<TSchema extends ZodType>(
  def: CapabilityDef<TSchema>
): CapMetadata {
  const formOmit = def.formOmit ?? DEFAULT_FORM_OMIT;
  const input = asJsonObject(
    z.toJSONSchema(def.input, CAP_INPUT_JSON_SCHEMA_OPTS)
  );
  const inputForm = omitFormKeys(input, formOmit);

  const descriptor: CapMetadata = {
    id: def.id,
    title: def.title,
    provider: structuredClone(def.provider),
    egress: deriveEgressClasses(def.contacts),
    contacts: structuredClone([...def.contacts]),
    input,
    inputForm,
  };

  if (def.description !== undefined) descriptor.description = def.description;
  if (def.dataSource !== undefined) descriptor.dataSource = def.dataSource;
  if (def.kind !== undefined) descriptor.kind = def.kind;
  const flags = deriveCapFlags(def);
  if (flags.length > 0) descriptor.flags = flags;
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

/** A {@link CapDescriptor} before the catalog generator stamps its code fingerprint. */
export type CapMetadata = Omit<CapDescriptor, "version">;

/**
 * Project a CapabilityDef into a JSON-serializable CapDescriptor. The `version` is the Cap's
 * code fingerprint, passed in by the catalog generator: the descriptor reads no file, so
 * nothing the fingerprint hashes depends on its own result.
 */
export function toCapDescriptor<TSchema extends ZodType>(
  def: CapabilityDef<TSchema>,
  version: string
): CapDescriptor {
  const { id, ...rest } = toCapMetadata(def);
  return { id, version, ...rest };
}
