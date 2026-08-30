import type { QueryClient } from "@tanstack/react-query";

import { resolveCollectSelection } from "@/domains/collect/lib/collect-filters";
import { buildCollectIndex } from "@/domains/collect/lib/collect-index";
import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import type { CollectRow } from "@/domains/collect/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceNeedsBlobText } from "@/domains/intake/hooks/use-evidence-blob.queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import {
  artifactContentQuery,
  capabilitiesListQuery,
  jobDetailQuery,
  jobsListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { credentialsListQuery } from "@/domains/settings/queries";
import {
  warmEnsureQueryData,
  warmPrefetchQuery,
} from "@/shared/lib/warm-query";

function isCancelledError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "CancelledError" || error.message === "CancelledError")
  );
}

async function resolveCollectSelectionRow(
  queryClient: QueryClient,
  caseId: string,
  selectedId: string
): Promise<{ row: CollectRow | null; focusRunId: string | null }> {
  const [evidence, jobs] = await Promise.all([
    queryClient.ensureQueryData(evidenceListQuery(caseId)),
    queryClient.ensureQueryData(jobsListQuery(caseId)),
  ]);
  const index = buildCollectIndex(evidence, jobs);
  const selection = resolveCollectSelection(
    selectedId,
    (id) => index.rowById(id),
    index.rows
  );
  return {
    row: selection.rowId === null ? null : index.rowById(selection.rowId),
    focusRunId: selection.focusRunId,
  };
}

/** Block Collect first paint until queue rows can render (route loader). */
export async function ensureCollectQueueQueries(
  queryClient: QueryClient,
  caseId: string
): Promise<void> {
  await Promise.all([
    queryClient.ensureQueryData(evidenceListQuery(caseId)),
    queryClient.ensureQueryData(jobsListQuery(caseId)),
    queryClient.ensureQueryData(entitiesListQuery(caseId)),
  ]);
}

/** Warm job detail when `?id=` resolves to a job-only row (route loader). */
export async function ensureCollectJobDetailWhenSelected(
  queryClient: QueryClient,
  caseId: string,
  selectedId: string
): Promise<void> {
  const { row, focusRunId } = await resolveCollectSelectionRow(
    queryClient,
    caseId,
    selectedId
  );
  const jobId = resolveCollectJobDetailId(row, focusRunId);
  if (jobId !== null) {
    await queryClient.ensureQueryData(jobDetailQuery(caseId, jobId));
  }
}

/** Warm uri-backed evidence text (JSON/XML) when `?id=` resolves to an evidence row. */
export async function ensureCollectEvidenceBlobWhenSelected(
  queryClient: QueryClient,
  caseId: string,
  selectedId: string
): Promise<void> {
  const { row } = await resolveCollectSelectionRow(
    queryClient,
    caseId,
    selectedId
  );
  const evidenceRow = row?.evidence ?? null;
  if (evidenceRow === null || !evidenceNeedsBlobText(evidenceRow)) return;
  await queryClient.ensureQueryData(
    artifactContentQuery({
      source: "evidence",
      caseId,
      evidenceId: evidenceRow.id,
      mime: evidenceRow.mime ?? "text/plain",
    })
  );
}

/** Fire-and-forget evidence blob warm on queue selection. */
export function prefetchCollectEvidenceBlobWhenSelected(
  queryClient: QueryClient,
  caseId: string,
  selectedId: string
): void {
  void (async () => {
    try {
      await ensureCollectEvidenceBlobWhenSelected(
        queryClient,
        caseId,
        selectedId
      );
    } catch (error: unknown) {
      if (isCancelledError(error)) return;
      if (import.meta.env.DEV) {
        console.warn("[prefetchCollectEvidenceBlobWhenSelected]", error);
      }
    }
  })();
}

/** Catalogs + background revalidation — does not block shell paint. */
export function warmCollectCatalogQueries(
  queryClient: QueryClient,
  caseId: string
): void {
  warmEnsureQueryData(queryClient, {
    ...capabilitiesListQuery(),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...playbooksListQuery(),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...credentialsListQuery(),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId),
    revalidateIfStale: true,
  });
  warmEnsureQueryData(queryClient, {
    ...jobsListQuery(caseId),
    revalidateIfStale: true,
  });
  warmPrefetchQuery(
    queryClient,
    evidenceListQuery(caseId, { hiddenOnly: true })
  );
}

/** Fire-and-forget warm — prefer `ensureCollectQueueQueries` in the loader. */
export function warmCollectQueries(
  queryClient: QueryClient,
  caseId: string,
  opts?: { selectedId?: string }
): void {
  warmCollectCatalogQueries(queryClient, caseId);

  const selectedId = opts?.selectedId;
  if (selectedId === undefined || selectedId === "") return;

  void (async () => {
    try {
      await Promise.all([
        ensureCollectJobDetailWhenSelected(queryClient, caseId, selectedId),
        ensureCollectEvidenceBlobWhenSelected(queryClient, caseId, selectedId),
      ]);
    } catch (error: unknown) {
      if (isCancelledError(error)) return;
      if (import.meta.env.DEV) {
        console.warn("[warmCollectQueries] job detail prefetch", error);
      }
    }
  })();
}
