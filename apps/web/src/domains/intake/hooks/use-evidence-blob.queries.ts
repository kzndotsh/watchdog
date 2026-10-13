import { useQuery } from "@tanstack/react-query";

import { evidenceShowsInlineText } from "@/domains/intake/lib/evidence";
import { evidenceDownloadUrlQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { artifactContentQuery } from "@/domains/jobs/artifact-queries";
import { queryEnabledFlag } from "@/shared/lib/query-enabled";

export function evidenceNeedsBlobText(
  evidence: EvidenceRecord | null
): boolean {
  if (!evidence) return false;
  if (evidence.text !== null && evidence.text !== "") return false;
  if (evidence.uri === null || evidence.uri === "") return false;
  return evidenceShowsInlineText(evidence);
}

export function buildEvidenceBlobState(input: {
  evidence: EvidenceRecord | null;
  isBlobTextNeeded: boolean;
  downloadUrl: string | null;
  isLoadingUrl: boolean;
  blobText: string | null;
  isLoadingBlob: boolean;
}) {
  return {
    isImage: input.evidence?.mime?.startsWith("image/") ?? false,
    downloadUrl: input.downloadUrl,
    loadingUrl: input.isLoadingUrl,
    resolvedText:
      input.evidence?.text ?? (input.isBlobTextNeeded ? input.blobText : null),
    loadingBlob: input.isLoadingBlob,
    hasUri: Boolean(input.evidence?.uri),
  };
}

export function useEvidenceBlobQueries(
  caseId: string,
  evidence: EvidenceRecord | null,
  isBlobTextNeeded: boolean
) {
  const downloadQueryOptions = evidenceDownloadUrlQuery(
    caseId,
    evidence?.id ?? ""
  );
  const downloadQueryEnabled =
    queryEnabledFlag(downloadQueryOptions.enabled) && Boolean(evidence?.uri);

  const blobQueryOptions = artifactContentQuery({
    source: "evidence",
    caseId,
    evidenceId: evidence?.id ?? "",
    mime: evidence?.mime ?? "text/plain",
  });
  const blobQueryEnabled =
    isBlobTextNeeded && queryEnabledFlag(blobQueryOptions.enabled);

  const downloadQuery = useQuery({
    ...downloadQueryOptions,
    enabled: downloadQueryEnabled,
  });

  const blobQuery = useQuery({
    ...blobQueryOptions,
    enabled: blobQueryEnabled,
  });

  return { downloadQuery, blobQuery, downloadQueryEnabled, blobQueryEnabled };
}
