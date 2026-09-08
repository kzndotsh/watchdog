import { kindLabel } from "@/shared/ui/vocab/kind.lib";
import {
  isJsonObject,
  normalizeJobInput,
  parseOptionalTrimmedUuid,
  type JsonObject,
  type JsonValue,
} from "@watchdog/schemas";

import { inputFormProperties } from "../types";

const FIELD_PRIORITY = [
  "host",
  "ip",
  "email",
  "handle",
  "hash",
  "query",
  "url",
  "evidenceId",
] as const;

const PLACEHOLDERS: Record<string, string> = {
  host: "Hostname e.g. host.tld",
  ip: "IP e.g. 8.8.8.8",
  email: "Email e.g. name@host.tld",
  handle: "Handle e.g. octocat",
  hash: "MD5 or SHA-256 file hash",
  query: "Lookup query",
  url: "Web address with host and optional path",
  evidenceId: "Evidence UUID",
};

function fieldPlaceholder(key: string, spec: JsonValue | undefined): string {
  if (isJsonObject(spec) && typeof spec.description === "string") {
    const described = spec.description.trim();
    if (described !== "") return described;
  }
  return PLACEHOLDERS[key] ?? key;
}

export interface CapPrimaryField {
  key: string;
  placeholder: string;
}

/** Primary Cap input field for the Jobs Run form (from CapDescriptor.inputForm). */
export function capPrimaryField(
  inputForm: JsonObject | undefined
): CapPrimaryField {
  const props = inputFormProperties(inputForm) ?? {};
  const keys = Object.keys(props);
  const key = FIELD_PRIORITY.find((k) => keys.includes(k)) ?? keys[0] ?? "host";
  return {
    key,
    placeholder: fieldPlaceholder(key, props[key]),
  };
}

export function buildCapRunInput(
  inputForm: JsonObject | undefined,
  value: string,
  entityId: string
): Record<string, string> {
  const { key } = capPrimaryField(inputForm);
  const scopedEntityId = parseOptionalTrimmedUuid(entityId);
  const input = normalizeJobInput({
    [key]: value.trim(),
    ...(scopedEntityId === undefined ? {} : { entityId: scopedEntityId }),
  });
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(input)) {
    if (typeof v === "string") out[k] = v;
  }
  return out;
}

export function formatCapIo(
  items:
    | readonly { kind: string; type?: string; evidenceKind?: string }[]
    | undefined
): string | null {
  if (items === undefined || items.length === 0) return null;
  return items
    .map((c) => {
      if (c.kind === "identifier" && c.type !== undefined && c.type !== "") {
        return kindLabel(c.type);
      }
      if (
        c.kind === "evidence" &&
        c.evidenceKind !== undefined &&
        c.evidenceKind !== ""
      ) {
        return kindLabel(c.evidenceKind);
      }
      return kindLabel(c.kind);
    })
    .join(", ");
}

export function formatCapCredentials(
  credentials:
    | readonly (
        | { name: string; optional?: boolean }
        | { anyOf: readonly string[] }
      )[]
    | undefined
): string | null {
  if (credentials === undefined || credentials.length === 0) return null;
  return credentials
    .map((spec) => {
      if ("anyOf" in spec) return `one of ${spec.anyOf.join(" | ")}`;
      return spec.optional === true ? `${spec.name} (optional)` : spec.name;
    })
    .join("; ");
}
