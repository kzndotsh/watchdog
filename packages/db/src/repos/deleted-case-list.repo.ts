import { and, eq, isNotNull } from "drizzle-orm";

import { deletedCaseList } from "@watchdog/schemas/cases";

import { cases } from "../schema/cases";
import { defineListRepo } from "./_list-query";
import { tombstonedCase } from "./_visible-case";
import { lifecycleColumns } from "./cases.repo";

/**
 * The organization's Deleted Cases list (`deletedCaseList`, ADR-0007): the tombstones of one
 * organization, read only for an owner or admin (core checks that first). The scope is the
 * organization and the tombstone predicate, so no binding below can reach a live Case. Builder
 * API only, like the other list bindings.
 */
export const deletedCaseListRepo = defineListRepo(deletedCaseList, {
  table: cases,
  base: (exec, listKey) =>
    exec
      .select({ ...lifecycleColumns, listKey })
      .from(cases)
      .$dynamic(),
  id: cases.id,
  scopeColumn: cases.organizationId,
  scope: ({ organizationId }) => {
    const inOrganization = eq(cases.organizationId, organizationId);
    // `and` answers undefined only for no conditions at all.
    return and(inOrganization, tombstonedCase) ?? inOrganization;
  },
  filters: {
    purging: (isOn) => (isOn ? isNotNull(cases.purgeStartedAt) : undefined),
  },
  sorts: {
    // nullable in the type, never null among tombstones: coalesce(deleted_at, epoch) through
    // `cases_deleted_list_idx`
    deleted: { column: cases.deletedAt, nullsAs: new Date(0) },
    name: cases.name,
  },
  search: {
    name: cases.name,
    slug: cases.slug,
    description: cases.description,
  },
});

/** A row of the Deleted Cases list: the tombstone and its cursor value. */
export type DeletedCaseListRow = Awaited<
  ReturnType<typeof deletedCaseListRepo.page>
>[number];
