import type { QueryClient } from "@tanstack/react-query";

import type { CollectSearch } from "@/domains/collect/lib/collect-search";
import { collectItemQuery, collectListView } from "@/domains/collect/queries";
import { evidenceNeedsBlobText } from "@/domains/intake/hooks/use-evidence-blob.queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import {
  capabilitiesListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { warmEnsureQueryData } from "@/shared/lib/warm-query";
import { collectList } from "@watchdog/schemas/jobs";

/** Warm uri-backed Evidence text (JSON/XML) when a row's Evidence is selected. */
export function prefetchCollectEvidenceBlob(
  queryClient: QueryClient,
  caseId: string,
  evidence: EvidenceRecord
): void {
  if (!evidenceNeedsBlobText(evidence)) return;
  warmEnsureQueryData(
    queryClient,
    artifactContentQuery({
      source: "evidence",
      caseId,
      evidenceId: evidence.id,
      mime: evidence.mime ?? "text/plain",
    })
  );
}

/**
 * The route loader's warm, without blocking shell paint: the Cap, Playbook and credential
 * catalogs, the URL's first queue page, and the selected row when the URL names one (its Detail
 * reads it by id only if the first page lacks it, so this is one cached read at most).
 */
export function warmCollectQueries(
  queryClient: QueryClient,
  caseId: string,
  search: CollectSearch
): void {
  warmEnsureQueryData(queryClient, {
    ...capabilitiesListQuery(),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...playbooksListQuery(),
    shouldRevalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...credentialsListQuery(),
    shouldRevalidateIfStale: true,
  });
  const query = collectList.queryOf(search);
  collectListView.warm(queryClient, { caseId }, query);
  const selected = collectItemQuery(
    caseId,
    search.id ?? null,
    query.filters.hidden
  );
  if (selected.enabled) warmEnsureQueryData(queryClient, selected);
}
