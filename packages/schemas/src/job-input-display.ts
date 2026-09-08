import type { z } from "zod";

import { type EntityTitleRow, entityTitleMapFromRows } from "./entity-display";
import {
  type EvidenceTitleRow,
  evidenceTitleMapFromRows,
} from "./evidence-display";
import type { JsonObject } from "./json";
import { isJsonObject } from "./json";
import { jsonObjectSchema, parseTrimmedCaseId } from "./primitives";

/** Loose job input bag — caps/CLI may hold values before JsonObject narrowing. */
export type JobInputRecord = Readonly<Record<string, unknown>>;

export const JOB_INPUT_HINT_KEYS = [
  "host",
  "domain",
  "ip",
  "url",
  "email",
  "hash",
  "handle",
  "target",
  "query",
  "name",
] as const;

export const JOB_INPUT_EVIDENCE_ID_KEYS = [
  "evidenceId",
  "sourceEvidenceId",
] as const;

export const JOB_INPUT_ENTITY_ID_KEYS = ["entityId"] as const;

const JOB_INPUT_SKIP_FALLBACK_KEYS = new Set<string>([
  ...JOB_INPUT_EVIDENCE_ID_KEYS,
  ...JOB_INPUT_ENTITY_ID_KEYS,
  "caseId",
  "jobId",
  "port",
  "timestamp",
  "limit",
]);

/** Entity ids referenced in job inputs (cap seeds / scoped runs). */
export function entityIdsFromJobInputs(
  inputs: readonly (JobInputRecord | null | undefined)[]
): string[] {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (input === null || input === undefined) continue;
    for (const key of JOB_INPUT_ENTITY_ID_KEYS) {
      const id = input[key];
      if (typeof id !== "string") continue;
      const parsed = parseTrimmedCaseId(id);
      if (parsed !== null) ids.add(parsed);
    }
  }
  return [...ids];
}

/** Entity id → display label for jobs that reference those entities in input. */
export function entityTitleMapForJobInputs(
  entities: readonly EntityTitleRow[],
  inputs: readonly (JobInputRecord | null | undefined)[]
): Map<string, string> {
  const needed = entityIdsFromJobInputs(inputs);
  if (needed.length === 0) return new Map();
  return entityTitleMapFromRows(entities, new Set(needed));
}

/** Evidence ids referenced in job inputs (process / enrich seeds). */
export function evidenceIdsFromJobInputs(
  inputs: readonly (JobInputRecord | null | undefined)[]
): string[] {
  const ids = new Set<string>();
  for (const input of inputs) {
    if (input === null || input === undefined) continue;
    for (const key of JOB_INPUT_EVIDENCE_ID_KEYS) {
      const id = input[key];
      if (typeof id !== "string") continue;
      const parsed = parseTrimmedCaseId(id);
      if (parsed !== null) ids.add(parsed);
    }
  }
  return [...ids];
}

/** Evidence id → display label for jobs that reference those ids in input. */
export function evidenceTitleMapForJobInputs(
  rows: readonly EvidenceTitleRow[],
  inputs: readonly (JobInputRecord | null | undefined)[]
): Map<string, string> {
  const needed = evidenceIdsFromJobInputs(inputs);
  if (needed.length === 0) return new Map();
  return evidenceTitleMapFromRows(rows, new Set(needed));
}

const JOB_INPUT_GRAPH_ID_KEYS = [
  ...JOB_INPUT_EVIDENCE_ID_KEYS,
  ...JOB_INPUT_ENTITY_ID_KEYS,
] as const;

/** Non-blank job input graph id fields that fail UUID validation. */
export function jobInputGraphIdFieldIssues(input: JsonObject): string[] {
  const invalid: string[] = [];
  for (const key of JOB_INPUT_GRAPH_ID_KEYS) {
    const value = input[key];
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed === "") continue;
    if (parseTrimmedCaseId(trimmed) === null) invalid.push(key);
  }
  return invalid;
}

/** Trim graph id fields; drop blank values. Does not strip invalid non-blank ids. */
export function normalizeJobInput(input: JsonObject): JsonObject {
  let changed = false;
  const out: JsonObject = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      (JOB_INPUT_GRAPH_ID_KEYS as readonly string[]).includes(key) &&
      typeof value === "string"
    ) {
      const trimmed = value.trim();
      if (trimmed === "") {
        changed = true;
        continue;
      }
      const parsed = parseTrimmedCaseId(trimmed);
      if (parsed === null) {
        out[key] = value;
      } else {
        out[key] = parsed;
        if (parsed !== value) changed = true;
      }
      continue;
    }
    out[key] = value;
  }
  return changed ? out : input;
}

/** Job input JSON with graph id fields validated and trimmed at ingress. */
export const jobInputObjectSchema = jsonObjectSchema
  .default({})
  .superRefine((input, ctx) => {
    for (const key of jobInputGraphIdFieldIssues(input)) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid ${key}`,
        path: [key],
      });
    }
  })
  .transform((input) => normalizeJobInput(input));

export type CapJobInputParse =
  | { ok: true; input: JsonObject }
  | { ok: false; message: string };

/** Validate Cap schema input and normalize graph id fields fail-closed. */
export function parseCapJobInput(
  capInputSchema: z.ZodType,
  raw: unknown
): CapJobInputParse {
  const parsed = capInputSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      message: `Invalid Cap input: ${parsed.error.message}`,
    };
  }
  if (!isJsonObject(parsed.data)) {
    return {
      ok: false,
      message: "Invalid Cap input: expected a JSON object",
    };
  }
  const issues = jobInputGraphIdFieldIssues(parsed.data);
  if (issues.length > 0) {
    const key = issues[0];
    return { ok: false, message: `Invalid ${key}` };
  }
  return { ok: true, input: normalizeJobInput(parsed.data) };
}

/** Short human subject for a Job input object. */
export function summarizeJobInput(
  input: JobInputRecord | JsonObject | null | undefined,
  evidenceTitleById?: ReadonlyMap<string, string>,
  entityTitleById?: ReadonlyMap<string, string>
): string {
  if (input === null || input === undefined) return "";

  for (const key of JOB_INPUT_HINT_KEYS) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }
  }

  for (const key of JOB_INPUT_EVIDENCE_ID_KEYS) {
    const id = input[key];
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed === "") continue;
    const lookupId = parseTrimmedCaseId(trimmed) ?? trimmed;
    const title = evidenceTitleById?.get(lookupId)?.trim();
    if (title !== undefined && title !== "") return title;
  }

  for (const key of JOB_INPUT_ENTITY_ID_KEYS) {
    const id = input[key];
    if (typeof id !== "string") continue;
    const trimmed = id.trim();
    if (trimmed === "") continue;
    const lookupId = parseTrimmedCaseId(trimmed) ?? trimmed;
    const title = entityTitleById?.get(lookupId)?.trim();
    if (title !== undefined && title !== "") return title;
  }

  for (const [key, value] of Object.entries(input)) {
    if (JOB_INPUT_SKIP_FALLBACK_KEYS.has(key)) continue;
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim().slice(0, 40);
    }
  }
  return "";
}
