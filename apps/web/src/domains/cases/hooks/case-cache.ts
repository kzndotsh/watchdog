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
