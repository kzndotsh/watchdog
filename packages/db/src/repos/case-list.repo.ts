import { and, eq } from "drizzle-orm";

import { caseList } from "@watchdog/schemas/cases";

import { cases } from "../schema/cases";
import { defineListRepo } from "./_list-query";
import { visibleCase } from "./_visible-case";
import { caseColumns } from "./cases.repo";

/**
 * The organization's Case list (`caseList`, ADR-0007): the live Cases of one organization, read
 * a page at a time for `cases.list` and `wd cases list`. The scope is the organization and the
 * visible-Case predicate, so no binding below can reach a tombstone or another organization's
 * Case. Builder API only, like the other list bindings.
 */
export const caseListRepo = defineListRepo(caseList, {
  table: cases,
  base: (exec, listKey) =>
    exec
      .select({ ...caseColumns, listKey })
      .from(cases)
      .$dynamic(),
  id: cases.id,
  scopeColumn: cases.organizationId,
  scope: ({ organizationId }) => {
    const inOrganization = eq(cases.organizationId, organizationId);
    // `and` answers undefined only for no conditions at all.
    return and(inOrganization, visibleCase) ?? inOrganization;
  },
  filters: {
    // `local` is always one of a Case's classes (`cases_allowed_egress_local`), so exactly
    // `['local']` is a Case that allows nothing more.
    localOnly: (isOn) =>
      isOn ? eq(cases.allowedEgress, ["local"]) : undefined,
  },
  // `cases_organization_egress_name_idx (organization_id, allowed_egress, name, id)`
  selective: { localOnly: cases.allowedEgress },
  sorts: {
    name: cases.name,
    created: cases.createdAt,
    updated: cases.updatedAt,
  },
  search: {
    name: cases.name,
    slug: cases.slug,
    description: cases.description,
  },
});

/** A row of the Case list: the Case and its cursor value. */
export type CaseListRow = Awaited<ReturnType<typeof caseListRepo.page>>[number];
