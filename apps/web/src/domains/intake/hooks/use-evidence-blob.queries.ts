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
  needsBlobText: boolean;
  downloadUrl: string | null;
  loadingUrl: boolean;
  blobText: string | null;
  loadingBlob: boolean;
}) {
  return {
    isImage: input.evidence?.mime?.startsWith("image/") ?? false,
    downloadUrl: input.downloadUrl,
    loadingUrl: input.loadingUrl,
    resolvedText:
      input.evidence?.text ?? (input.needsBlobText ? input.blobText : null),
    loadingBlob: input.loadingBlob,
    hasUri: Boolean(input.evidence?.uri),
  };
}

export function useEvidenceBlobQueries(
  caseId: string,
  evidence: EvidenceRecord | null,
  needsBlobText: boolean
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
    needsBlobText && queryEnabledFlag(blobQueryOptions.enabled);

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
