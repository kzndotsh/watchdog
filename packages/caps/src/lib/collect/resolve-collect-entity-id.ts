import { parseTrimmedCaseId, trimmedOrUndefined } from "@watchdog/schemas";

export const INVALID_COLLECT_ENTITY_SUMMARY = "Entity id is not a valid UUID";

/**
 * Resolve optional Collect interpret `entityId`.
 * `undefined` = absent/blank; `null` = present but invalid; string = valid UUID.
 */
export function resolveCollectEntityId(
  entityId: string | null | undefined
): string | undefined | null {
  if (entityId === null) return null;
  if (entityId === undefined) return undefined;
  const trimmed = trimmedOrUndefined(entityId);
  if (trimmed === undefined) return undefined;
  return parseTrimmedCaseId(trimmed) ?? null;
}
