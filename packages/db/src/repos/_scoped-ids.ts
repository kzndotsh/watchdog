import {
  type CaseId,
  type OrganizationId,
  organizationIdSchema,
  parseActorId,
  parseTrimmedCaseId,
  parseTrimmedUuid,
} from "@watchdog/schemas/shared";

/** Trim a non-empty actor id (user id, api-key label, test fixture); not a graph UUID. */
export function trimActorId(actorId: string): string | undefined {
  return parseActorId(actorId);
}

/** Trim + validate a Case UUID; blank or invalid → undefined (repo miss). */
export function trimCaseId(caseId: string): CaseId | undefined {
  return parseTrimmedCaseId(caseId) ?? undefined;
}

/** Validate an organization id for a scoped lookup; blank → undefined (repo miss). */
export function scopeOrganizationId(
  organizationId: string
): OrganizationId | undefined {
  const parsed = organizationIdSchema.safeParse(organizationId);
  return parsed.success ? parsed.data : undefined;
}

/** Trim + validate a graph resource UUID; blank or invalid → undefined (repo miss). */
export function trimResourceId(resourceId: string): string | undefined {
  return parseTrimmedUuid(resourceId) ?? undefined;
}

export type NullableGraphIdWrite =
  | { ok: true; id: string | null | undefined }
  | { ok: false };

/** Fail-closed nullable graph id ingress: blank → null; invalid non-empty → ok: false. */
export function resolveNullableGraphIdForWrite(
  resourceId: string | null | undefined
): NullableGraphIdWrite {
  if (resourceId === undefined) return { ok: true, id: undefined };
  if (resourceId === null) return { ok: true, id: null };
  const trimmed = resourceId.trim();
  if (trimmed === "") return { ok: true, id: null };
  const parsed = trimResourceId(resourceId);
  if (parsed === undefined) return { ok: false };
  return { ok: true, id: parsed };
}

/** Trim case + resource ids for scoped lookups; blank ids miss instead of matching garbage. */
export function trimScopedCaseIds(
  caseId: string,
  resourceId: string
): { caseId: CaseId; resourceId: string } | null {
  const scopedCaseId = trimCaseId(caseId);
  const scopedResourceId = trimResourceId(resourceId);
  if (scopedCaseId === undefined || scopedResourceId === undefined) {
    return null;
  }
  return { caseId: scopedCaseId, resourceId: scopedResourceId };
}
