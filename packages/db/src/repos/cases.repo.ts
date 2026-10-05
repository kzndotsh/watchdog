import { type SQL, and, asc, eq, ilike, or, sql } from "drizzle-orm";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { entitySlugIlikePatterns } from "./_ilike";
import { clampSearchLimit } from "./_limits";
import { scopeOrganizationId, trimCaseId } from "./_scoped-ids";
import { slugForLookup } from "./_slug-lookup";

export const caseColumns = {
  id: cases.id,
  name: cases.name,
  slug: cases.slug,
  description: cases.description,
  organizationId: cases.organizationId,
  allowThirdPartyEgress: cases.allowThirdPartyEgress,
} as const;

export type CaseRow = {
  [K in keyof typeof caseColumns]: (typeof cases.$inferSelect)[K &
    keyof typeof cases.$inferSelect];
};

export type NewCase = Pick<
  typeof cases.$inferInsert,
  "name" | "slug" | "description"
> & { organizationId: string };

export type CasePatch = Partial<
  Pick<
    typeof cases.$inferInsert,
    "name" | "slug" | "description" | "allowThirdPartyEgress"
  >
>;

function inOrg(organizationId: string): SQL {
  const scoped = scopeOrganizationId(organizationId);
  return scoped === undefined ? sql`false` : eq(cases.organizationId, scoped);
}

export const casesRepo = {
  async list(exec: DbExec, organizationId: string): Promise<CaseRow[]> {
    return exec
      .select(caseColumns)
      .from(cases)
      .where(inOrg(organizationId))
      .orderBy(asc(cases.name));
  },

  async listIds(exec: DbExec, organizationId: string): Promise<string[]> {
    const rows = await exec
      .select({ id: cases.id })
      .from(cases)
      .where(inOrg(organizationId));
    return rows.map((row) => row.id);
  },

  async search(
    exec: DbExec,
    organizationId: string,
    term: string,
    limit: number
  ): Promise<CaseRow[]> {
    const safeLimit = clampSearchLimit(limit);
    const slugPatterns = entitySlugIlikePatterns(term);
    if (slugPatterns.length === 0) return [];
    const pattern = slugPatterns[0];
    const slugMatches = slugPatterns.map((p) => ilike(cases.slug, p));
    return exec
      .select(caseColumns)
      .from(cases)
      .where(
        and(
          inOrg(organizationId),
          or(
            ilike(cases.name, pattern),
            ...slugMatches,
            ilike(cases.description, pattern)
          )
        )
      )
      .orderBy(asc(cases.name))
      .limit(safeLimit);
  },

  async getById(
    exec: DbExec,
    id: string,
    organizationId: string
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .limit(1);
    return row ?? null;
  },

  /** Worker / export internals: case id already came from a trusted job or child row. */
  async getByIdUnchecked(exec: DbExec, id: string): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(eq(cases.id, scopedId))
      .limit(1);
    return row ?? null;
  },

  /** Serialize proposal ingress for a Case (suppress + insert). */
  async lockById(exec: DbExec, id: string): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(eq(cases.id, scopedId))
      .limit(1)
      .for("update");
    return row ?? null;
  },

  async getBySlug(
    exec: DbExec,
    slug: string,
    organizationId: string
  ): Promise<CaseRow | null> {
    const scopedSlug = slugForLookup(slug);
    if (scopedSlug === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.slug, scopedSlug), inOrg(organizationId)))
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewCase): Promise<CaseRow | null> {
    const organizationId = scopeOrganizationId(values.organizationId);
    if (organizationId === undefined) return null;
    const [created] = await exec
      .insert(cases)
      .values({ ...values, organizationId })
      .returning(caseColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    id: string,
    organizationId: string,
    patch: CasePatch
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [updated] = await exec
      .update(cases)
      .set(patch)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .returning(caseColumns);
    return updated ?? null;
  },

  async delete(
    exec: DbExec,
    id: string,
    organizationId: string
  ): Promise<CaseRow | null> {
    const scopedId = trimCaseId(id);
    if (scopedId === undefined) return null;
    const [deleted] = await exec
      .delete(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .returning(caseColumns);
    return deleted ?? null;
  },
};
