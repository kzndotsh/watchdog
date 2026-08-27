import { casesRepo, db, type CaseRow } from "@watchdog/db";
import { slugifyName } from "@watchdog/schemas";

import { deleteCaseArtifacts } from "../infra/blob";
import { DomainError, isUniqueViolation } from "../infra/domain-error";
import { notifyEntityChanged } from "../infra/events";
import {
  removeCaseExportDir,
  renameCaseExportDir,
  scheduleCaseExport,
} from "../infra/export-sync";
import { logProcess, logSwallowed } from "../infra/process-log";

const SLUG_UNIQUE_INDEX = "cases_slug_unique";

export interface CaseRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  allowThirdPartyEgress: boolean;
}

export interface CreateCaseInput {
  name: string;
  slug: string;
  description?: string;
}

/** Derive the Case URL slug from a display name. Empty if unsugifiable. */
export function slugForCaseName(name: string): string {
  return slugifyName(name);
}

function toRecord(row: CaseRow): CaseRecord {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? null,
    allowThirdPartyEgress: row.allowThirdPartyEgress,
  };
}

export async function listCases(): Promise<CaseRecord[]> {
  const rows = await casesRepo.list(db);
  return rows.map(toRecord);
}

export async function getCaseById(id: string): Promise<CaseRecord | null> {
  const row = await casesRepo.getById(db, id);
  return row ? toRecord(row) : null;
}

export async function getCaseBySlug(slug: string): Promise<CaseRecord | null> {
  const row = await casesRepo.getBySlug(db, slug);
  return row ? toRecord(row) : null;
}

export async function createCase(input: CreateCaseInput): Promise<CaseRecord> {
  const existing = await casesRepo.getBySlug(db, input.slug);
  if (existing) {
    throw new DomainError("conflict", `Slug "${input.slug}" already exists`);
  }

  try {
    const created = await casesRepo.create(db, {
      name: input.name,
      slug: input.slug,
      description: input.description ?? null,
    });
    if (!created) {
      throw new DomainError("invalid", "Failed to create Case");
    }
    return toRecord(created);
  } catch (error) {
    if (isUniqueViolation(error, SLUG_UNIQUE_INDEX)) {
      throw new DomainError("conflict", `Slug "${input.slug}" already exists`);
    }
    throw error;
  }
}

export function updateCase(input: {
  id: string;
  name?: string;
  description?: string;
  allowThirdPartyEgress?: boolean;
}): Promise<CaseRecord> {
  return (async () => {
    const existing = await casesRepo.getById(db, input.id);
    if (!existing) throw new DomainError("not_found", "Case not found");

    let nextSlug: string | undefined;
    if (input.name !== undefined) {
      const slug = slugForCaseName(input.name);
      if (slug === "") {
        throw new DomainError(
          "invalid",
          "Name must contain letters or numbers"
        );
      }
      if (slug !== existing.slug) {
        const taken = await casesRepo.getBySlug(db, slug);
        if (taken !== null && taken.id !== existing.id) {
          throw new DomainError("conflict", `Slug "${slug}" already exists`);
        }
        nextSlug = slug;
      }
    }

    try {
      const updated = await casesRepo.update(db, input.id, {
        ...(input.name === undefined ? {} : { name: input.name }),
        ...(nextSlug === undefined ? {} : { slug: nextSlug }),
        ...(input.description === undefined
          ? {}
          : { description: input.description }),
        ...(input.allowThirdPartyEgress === undefined
          ? {}
          : { allowThirdPartyEgress: input.allowThirdPartyEgress }),
      });

      if (!updated) throw new DomainError("not_found", "Case not found");

      if (nextSlug !== undefined) {
        try {
          await renameCaseExportDir(existing.slug, nextSlug);
        } catch (error) {
          logSwallowed("rename-case-export", error, {
            from: existing.slug,
            to: nextSlug,
          });
        }
        void scheduleCaseExport(input.id);
      }

      return toRecord(updated);
    } catch (error) {
      if (isUniqueViolation(error, SLUG_UNIQUE_INDEX)) {
        throw new DomainError("conflict", `Slug "${nextSlug}" already exists`);
      }
      throw error;
    }
  })();
}

export function deleteCase(
  id: string,
  opts?: { actorId?: string }
): Promise<void> {
  return (async () => {
    const existing = await casesRepo.getById(db, id);
    if (!existing) throw new DomainError("not_found", "Case not found");

    const deleted = await casesRepo.delete(db, id);
    if (!deleted) throw new DomainError("invalid", "Failed to delete Case");
    if (opts?.actorId) {
      logProcess("case.delete", "Case deleted", {
        caseId: id,
        actorId: opts.actorId,
      });
    }
    notifyEntityChanged(id);

    try {
      await deleteCaseArtifacts(id);
    } catch (error) {
      logSwallowed("delete-case-artifacts", error, { caseId: id });
    }
    try {
      await removeCaseExportDir(existing.slug);
    } catch (error) {
      logSwallowed("delete-case-export", error, { slug: existing.slug });
    }
  })();
}
