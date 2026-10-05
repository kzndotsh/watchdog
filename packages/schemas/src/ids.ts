import { z } from "zod";

/**
 * Branded id kinds (ADR-0003). A branded value is assignable to `string`, never
 * the other way round, so swapping a case id and an organization id fails to
 * compile. Mint a brand only through these schemas or constructors; the
 * `watchdog/no-brand-cast` lint rule bans `as OrganizationId` / `as CaseId`.
 */

/** Opaque Better Auth organization id (text, not a uuid). */
export const organizationIdSchema = z.string().min(1).brand<"OrganizationId">();
export type OrganizationId = z.infer<typeof organizationIdSchema>;

/** Case id (uuid). */
export const caseIdSchema = z.uuid().brand<"CaseId">();
export type CaseId = z.infer<typeof caseIdSchema>;

/** Case id that trims surrounding whitespace before validation. */
export const trimmedCaseIdSchema = z.string().trim().pipe(caseIdSchema);

/** Validating constructor: throws a `ZodError` when `value` is not an organization id. */
export function asOrganizationId(value: string): OrganizationId {
  return organizationIdSchema.parse(value);
}

/** Validating constructor: throws a `ZodError` when `value` is not a uuid. */
export function asCaseId(value: string): CaseId {
  return caseIdSchema.parse(value);
}
