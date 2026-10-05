import {
  caseScopeInputSchema,
  entitySlugScopeInputSchema,
} from "@watchdog/schemas/graph";
import {
  type CaseId,
  entitySlugSchema,
  parseTrimmedCaseId,
  parseTrimmedUuid,
} from "@watchdog/schemas/shared";

import { api } from "./client";
import { fail } from "./io";

function failInvalidUuid(value: string, label: string): never {
  return fail(
    "USAGE",
    value.trim() === ""
      ? `${label} must not be blank`
      : `${label} must be a valid UUID`,
    { help: ["wd --help"] }
  );
}

/** Trim and validate a positional UUID argument (any non-Case kind). */
export function requireUuid(value: string, label: string): string {
  return parseTrimmedUuid(value) ?? failInvalidUuid(value, label);
}

/**
 * Trim and validate a case UUID from `-c` / `--case`; the result is a branded
 * `CaseId`. Invalid input is a clean `USAGE` error, never a throw.
 */
export function requireCaseId(value: unknown): CaseId {
  if (value === undefined || value === "") {
    fail("USAGE", "Missing required --case", {
      help: ["wd <noun> list -c <caseId>"],
    });
  }
  if (typeof value !== "string") {
    fail("USAGE", "Case ID must be a string", {
      help: ["wd <noun> list -c <caseId>"],
    });
  }
  return parseTrimmedCaseId(value) ?? failInvalidUuid(value, "Case ID");
}

/** Comma-separated UUID list (shared by graph / proposals / child writes). */
export function parseIdList(raw: string | undefined): string[] | undefined {
  if (raw === undefined || raw === "") return undefined;
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return undefined;
  return ids.map((id) => {
    const parsed = parseTrimmedUuid(id);
    if (parsed === null) {
      fail("USAGE", `Invalid UUID in list: ${id}`, {
        help: ["Comma-separated UUIDs, e.g. --evidence <id1>,<id2>"],
      });
    }
    return parsed;
  });
}

/**
 * PATCH evidence list: omit flag = no change, blank = clear all, list = set.
 * Create flows should keep using `parseIdList` (blank omits the field).
 */
export function parsePatchIdList(
  raw: string | undefined
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (raw.trim() === "") return [];
  return parseIdList(raw);
}

/**
 * Child oRPC procedures take entity UUID; `entities.get` is slug-only.
 * Accept either and resolve.
 */
async function resolveEntityRef(
  caseId: CaseId,
  slugOrUuid: string
): Promise<{ id: string; slug: string }> {
  const trimmed = slugOrUuid.trim();
  if (trimmed === "") {
    fail("USAGE", "--entity is required", {
      help: ["wd entities list -c <caseId>"],
    });
  }
  const asUuid = parseTrimmedUuid(trimmed);
  if (asUuid !== null) {
    const rows = await api().entities.list(
      caseScopeInputSchema.parse({ caseId })
    );
    const row = rows.find((entity) => entity.id === asUuid);
    if (!row) {
      fail("not_found", `Entity not found: ${trimmed}`, {
        help: ["wd entities list -c <caseId>"],
      });
    }
    return { id: row.id, slug: row.slug };
  }
  const slugParsed = entitySlugSchema.safeParse(trimmed);
  if (!slugParsed.success) {
    fail("USAGE", `Invalid entity reference: ${trimmed}`, {
      help: ["wd entities list -c <caseId>"],
    });
  }
  const row = await api().entities.get(
    entitySlugScopeInputSchema.parse({
      caseId,
      slug: slugParsed.data,
    })
  );
  return { id: row.id, slug: row.slug };
}

export async function resolveEntityId(
  caseId: CaseId,
  slugOrUuid: string
): Promise<string> {
  const ref = await resolveEntityRef(caseId, slugOrUuid);
  return ref.id;
}

/**
 * Export and other slug-based HTTP paths accept entity UUID or slug.
 */
export async function resolveEntitySlug(
  caseId: CaseId,
  slugOrUuid: string
): Promise<string> {
  const ref = await resolveEntityRef(caseId, slugOrUuid);
  return ref.slug;
}
