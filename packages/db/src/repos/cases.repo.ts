import { and, asc, eq, ilike, or } from "drizzle-orm";

import {
  slugifyName,
  trimmedOrNull,
  trimmedOrUndefined,
} from "@watchdog/schemas";

import type { DbExec } from "../exec";
import { cases } from "../schema/cases";
import { entitySlugIlikePatterns } from "./_ilike";
import { clampSearchLimit } from "./_limits";
import { trimResourceId } from "./_scoped-ids";

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
  "name" | "slug" | "description" | "organizationId"
>;

export type CasePatch = Partial<
  Pick<
    typeof cases.$inferInsert,
    "name" | "slug" | "description" | "allowThirdPartyEgress"
  >
>;

function inOrg(organizationId: string) {
  return eq(cases.organizationId, organizationId);
}

function caseNameForWrite(name: string): string | undefined {
  return trimmedOrUndefined(name);
}

function caseSlugForWrite(slug: string): string | undefined {
  const normalized = slugifyName(slug);
  return normalized === "" ? undefined : normalized;
}

function casePatchForWrite(patch: CasePatch): CasePatch | null {
  const next: CasePatch = { ...patch };
  if (patch.name !== undefined) {
    const name = caseNameForWrite(patch.name);
    if (name === undefined) return null;
    next.name = name;
  }
  if (patch.slug !== undefined) {
    const slug = caseSlugForWrite(patch.slug);
    if (slug === undefined) return null;
    next.slug = slug;
  }
  if (patch.description !== undefined) {
    next.description = trimmedOrNull(patch.description);
  }
  return next;
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
    const scopedId = trimResourceId(id);
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
    const scopedId = trimResourceId(id);
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
    const scopedId = trimResourceId(id);
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
    const scopedSlug = caseSlugForWrite(slug);
    if (scopedSlug === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(and(eq(cases.slug, scopedSlug), inOrg(organizationId)))
      .limit(1);
    return row ?? null;
  },

  /** Global slug uniqueness (index is not org-scoped). */
  async getBySlugUnchecked(
    exec: DbExec,
    slug: string
  ): Promise<CaseRow | null> {
    const scopedSlug = caseSlugForWrite(slug);
    if (scopedSlug === undefined) return null;
    const [row] = await exec
      .select(caseColumns)
      .from(cases)
      .where(eq(cases.slug, scopedSlug))
      .limit(1);
    return row ?? null;
  },

  async create(exec: DbExec, values: NewCase): Promise<CaseRow | null> {
    const name = caseNameForWrite(values.name);
    const slug = caseSlugForWrite(values.slug);
    if (name === undefined || slug === undefined) return null;
    const [created] = await exec
      .insert(cases)
      .values({
        ...values,
        name,
        slug,
        description: trimmedOrNull(values.description),
      })
      .returning(caseColumns);
    return created ?? null;
  },

  async update(
    exec: DbExec,
    id: string,
    organizationId: string,
    patch: CasePatch
  ): Promise<CaseRow | null> {
    const scopedId = trimResourceId(id);
    if (scopedId === undefined) return null;
    const normalizedPatch = casePatchForWrite(patch);
    if (normalizedPatch === null) return null;
    const [updated] = await exec
      .update(cases)
      .set(normalizedPatch)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .returning(caseColumns);
    return updated ?? null;
  },

  async delete(
    exec: DbExec,
    id: string,
    organizationId: string
  ): Promise<CaseRow | null> {
    const scopedId = trimResourceId(id);
    if (scopedId === undefined) return null;
    const [deleted] = await exec
      .delete(cases)
      .where(and(eq(cases.id, scopedId), inOrg(organizationId)))
      .returning(caseColumns);
    return deleted ?? null;
  },
};
