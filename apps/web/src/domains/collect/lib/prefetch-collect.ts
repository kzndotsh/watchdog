import type { QueryClient } from "@tanstack/react-query";

import { resolveCollectSelection } from "@/domains/collect/lib/collect-filters";
import {
  buildCollectIndex,
  collectIndexOptionsFromPlaybooks,
} from "@/domains/collect/lib/collect-index";
import { resolveCollectJobDetailId } from "@/domains/collect/lib/collect-job-detail";
import type { CollectRow } from "@/domains/collect/types";
import { entitiesListQuery } from "@/domains/entities/queries";
import { evidenceNeedsBlobText } from "@/domains/intake/hooks/use-evidence-blob.queries";
import { evidenceListQuery } from "@/domains/intake/queries";
import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import {
  capabilitiesListQuery,
  jobDetailQuery,
  jobsListQuery,
  playbooksListQuery,
} from "@/domains/jobs/queries";
import { credentialsListQuery } from "@/domains/settings/queries";
import { scopeOptionalUuid } from "@/shared/lib/query-ingress";
import {
  ensureAppQueryData,
  warmEnsureQueryData,
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
  const [evidence, jobs, playbooks] = await Promise.all([
    ensureAppQueryData(queryClient, evidenceListQuery(caseId)),
    ensureAppQueryData(queryClient, jobsListQuery(caseId)),
    ensureAppQueryData(queryClient, playbooksListQuery()),
  ]);
  const index = buildCollectIndex(
    evidence,
    jobs,
    collectIndexOptionsFromPlaybooks(playbooks)
  );
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
    ensureAppQueryData(queryClient, evidenceListQuery(caseId)),
    ensureAppQueryData(
      queryClient,
      evidenceListQuery(caseId, { hiddenOnly: true })
    ),
    ensureAppQueryData(queryClient, jobsListQuery(caseId)),
    ensureAppQueryData(queryClient, entitiesListQuery(caseId)),
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
    await ensureAppQueryData(queryClient, jobDetailQuery(caseId, jobId));
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
  await ensureAppQueryData(
    queryClient,
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
      // Fire-and-forget: CancelledError is expected on route teardown; other
      // failures are non-blocking for selection UX.
      if (!isCancelledError(error)) {
        /* ignore */
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
  warmEnsureQueryData(queryClient, {
    ...evidenceListQuery(caseId, { hiddenOnly: true }),
    revalidateIfStale: true,
  });
}

/** Fire-and-forget warm — prefer `ensureCollectQueueQueries` in the loader. */
export function warmCollectQueries(
  queryClient: QueryClient,
  caseId: string,
  opts?: { selectedId?: string }
): void {
  warmCollectCatalogQueries(queryClient, caseId);

  const scopedSelectedId = scopeOptionalUuid(opts?.selectedId);
  if (scopedSelectedId === undefined) return;

  void (async () => {
    try {
      await Promise.all([
        ensureCollectJobDetailWhenSelected(
          queryClient,
          caseId,
          scopedSelectedId
        ),
        ensureCollectEvidenceBlobWhenSelected(
          queryClient,
          caseId,
          scopedSelectedId
        ),
      ]);
    } catch (error: unknown) {
      if (!isCancelledError(error)) {
        /* ignore */
      }
    }
  })();
}
