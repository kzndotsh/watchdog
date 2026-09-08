import {
  caseScopeInputSchema,
  entitySlugSchema,
  entitySlugScopeInputSchema,
  parseTrimmedCaseId,
} from "@watchdog/schemas";

import { api } from "./client";
import { fail } from "./io";

/** Trim and validate a positional UUID argument. */
export function requireUuid(value: string, label: string): string {
  const parsed = parseTrimmedCaseId(value);
  if (parsed === null) {
    fail(
      "USAGE",
      value.trim() === ""
        ? `${label} must not be blank`
        : `${label} must be a valid UUID`,
      { help: ["wd --help"] }
    );
  }
  return parsed;
}

/** Trim and validate a case UUID from `-c` / `--case`. */
export function requireCaseId(value: unknown): string {
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
  return requireUuid(value, "Case ID");
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
    const parsed = parseTrimmedCaseId(id);
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
  caseId: string,
  slugOrUuid: string
): Promise<{ id: string; slug: string }> {
  const { caseId: trimmedCaseId } = caseScopeInputSchema.parse({ caseId });
  const trimmed = slugOrUuid.trim();
  if (trimmed === "") {
    fail("USAGE", "--entity is required", {
      help: ["wd entities list -c <caseId>"],
    });
  }
  const asUuid = parseTrimmedCaseId(trimmed);
  if (asUuid !== null) {
    const rows = await api().entities.list(
      caseScopeInputSchema.parse({ caseId: trimmedCaseId })
    );
    const row = rows.find((entity) => entity.id === asUuid);
    if (!row) {
      fail("NOT_FOUND", `Entity not found: ${trimmed}`, {
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
      caseId: trimmedCaseId,
      slug: slugParsed.data,
    })
  );
  return { id: row.id, slug: row.slug };
}

export async function resolveEntityId(
  caseId: string,
  slugOrUuid: string
): Promise<string> {
  const ref = await resolveEntityRef(caseId, slugOrUuid);
  return ref.id;
}

/**
 * Export and other slug-based HTTP paths accept entity UUID or slug.
 */
export async function resolveEntitySlug(
  caseId: string,
  slugOrUuid: string
): Promise<string> {
  const ref = await resolveEntityRef(caseId, slugOrUuid);
  return ref.slug;
}
