import type { EvidenceRecord } from "@/domains/intake/types";
import { listPending } from "@/shared/lib/list-pending";
import { queryLoadError } from "@/shared/lib/query-load-error";

import {
  buildEvidenceBlobState,
  evidenceNeedsBlobText,
  useEvidenceBlobQueries,
} from "./use-evidence-blob.queries";

export function useEvidenceBlob(
  caseId: string,
  evidence: EvidenceRecord | null
) {
  const needsBlobText = evidenceNeedsBlobText(evidence);
  const { downloadQuery, blobQuery, downloadQueryEnabled, blobQueryEnabled } =
    useEvidenceBlobQueries(caseId, evidence, needsBlobText);

  const blobPlaceholder =
    downloadQuery.isPlaceholderData || blobQuery.isPlaceholderData;
  const contentPending =
    listPending(downloadQuery, { enabled: downloadQueryEnabled }) ||
    listPending(blobQuery, { enabled: blobQueryEnabled });
  const downloadLoadError = downloadQueryEnabled
    ? queryLoadError(
        downloadQuery,
        contentPending,
        "Failed to load download URL"
      )
    : null;
  const blobLoadError = blobQueryEnabled
    ? queryLoadError(
        blobQuery,
        contentPending,
        "Failed to load evidence content"
      )
    : null;

  return {
    ...buildEvidenceBlobState({
      evidence,
      needsBlobText,
      downloadUrl: downloadQuery.data?.url ?? null,
      loadingUrl: listPending(downloadQuery, { enabled: downloadQueryEnabled }),
      blobText: blobQuery.data?.text ?? null,
      loadingBlob:
        blobQueryEnabled &&
        listPending(blobQuery, { enabled: blobQueryEnabled }),
    }),
    blobPlaceholder,
    blobLoadError,
    downloadLoadError,
    contentLoadError: blobLoadError ?? downloadLoadError,
    retryContent: () => {
      if (downloadQuery.isError) void downloadQuery.refetch();
      if (blobQuery.isError) void blobQuery.refetch();
    },
  };
}
