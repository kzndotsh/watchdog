import type { QueryClient } from "@tanstack/react-query";

import {
  caseByIdQuery,
  caseBySlugQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CaseRecord, CasesContext } from "@/domains/cases/types";

/** Seed Case caches so the switcher / overview don't keep a stale name. */
export function writeCaseRecordCache(
  client: QueryClient,
  caseRow: CaseRecord,
  previous?: { slug: string }
): void {
  if (previous !== undefined && previous.slug !== caseRow.slug) {
    client.removeQueries({
      queryKey: caseBySlugQuery(previous.slug).queryKey,
    });
  }
  client.setQueryData(caseByIdQuery(caseRow.id).queryKey, caseRow);
  client.setQueryData(caseBySlugQuery(caseRow.slug).queryKey, caseRow);
  client.setQueryData<CasesContext>(casesKeys.context(), (prev) => {
    if (!prev) return prev;
    return {
      cases: prev.cases.map((row) => (row.id === caseRow.id ? caseRow : row)),
      active: prev.active?.id === caseRow.id ? caseRow : prev.active,
    };
  });
}

/**
 * A deleted Case leaves every Case cache at once: its detail rows go (a route guard reading
 * the cached row would otherwise let a link into a Case the server now hides), and the list the
 * switcher, sidebar, palette and Cases page share loses it, with the Active Case healing to the
 * first remaining one the way the server's cookie does.
 */
export function dropCaseFromCaches(
  client: QueryClient,
  caseRow: Pick<CaseRecord, "id" | "slug">
): void {
  client.removeQueries({ queryKey: caseByIdQuery(caseRow.id).queryKey });
  client.removeQueries({ queryKey: caseBySlugQuery(caseRow.slug).queryKey });
  client.setQueryData<CasesContext>(casesKeys.context(), (prev) => {
    if (!prev) return prev;
    const cases = prev.cases.filter((row) => row.id !== caseRow.id);
    return {
      cases,
      active: prev.active?.id === caseRow.id ? (cases[0] ?? null) : prev.active,
    };
  });
}

/** A restored Case is visible again: forget the "not found" a stale route guard cached for its URL. */
export function forgetMissingCase(
  client: QueryClient,
  caseRow: Pick<CaseRecord, "id" | "slug">
): void {
  client.removeQueries({ queryKey: caseByIdQuery(caseRow.id).queryKey });
  client.removeQueries({ queryKey: caseBySlugQuery(caseRow.slug).queryKey });
  client.removeQueries({
    queryKey: casesKeys.deletedBySlug(caseRow.slug),
  });
}
