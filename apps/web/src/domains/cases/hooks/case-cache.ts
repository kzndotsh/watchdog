import type { QueryClient } from "@tanstack/react-query";

import {
  caseByIdQuery,
  caseBySlugQuery,
  casesKeys,
} from "@/domains/cases/queries";
import type { CaseRecord } from "@/domains/cases/types";

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
  client.setQueryData<CaseRecord[]>(casesKeys.visible(), (prev) =>
    prev?.map((row) => (row.id === caseRow.id ? caseRow : row))
  );
}

/**
 * A deleted Case leaves every Case cache at once: its detail rows go (a route guard reading
 * the cached row would otherwise let a link into a Case the server now hides), and the list the
 * switcher, sidebar, palette and Cases page share loses it (a Case-less screen whose last Case
 * entered was this one then defaults to the first remaining Case).
 */
export function dropCaseFromCaches(
  client: QueryClient,
  caseRow: Pick<CaseRecord, "id" | "slug">
): void {
  client.removeQueries({ queryKey: caseByIdQuery(caseRow.id).queryKey });
  client.removeQueries({ queryKey: caseBySlugQuery(caseRow.slug).queryKey });
  client.setQueryData<CaseRecord[]>(casesKeys.visible(), (prev) =>
    prev?.filter((row) => row.id !== caseRow.id)
  );
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
