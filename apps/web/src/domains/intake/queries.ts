import { queryOptions } from "@tanstack/react-query";

import {
  getEvidenceDownloadUrlFn,
  listEvidenceFn,
} from "@/domains/intake/intake.functions";
import {
  parseEvidenceScopeInput,
  parseListEvidenceInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeEvidenceDownload,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";

export const evidenceKeys = {
  all: (caseId: string) => ["evidence", caseId] as const,
  list: (caseId: string, hiddenOnly = false) =>
    ["evidence", caseId, "list", hiddenOnly ? "hidden" : "active"] as const,
  download: (caseId: string, evidenceId: string) =>
    ["evidence", caseId, "download", evidenceId] as const,
};

export const evidenceListQuery = (
  caseId: string,
  opts?: { hiddenOnly?: boolean }
) => {
  const hiddenOnly = opts?.hiddenOnly === true;
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = evidenceKeys.list(scopedCaseId, hiddenOnly);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEvidenceFn({
        data: parseListEvidenceInput(scopedCaseId, hiddenOnly),
      }),
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

export const evidenceDownloadUrlQuery = (
  caseId: string,
  evidenceId: string
) => {
  const { scoped, enabled } = scopeEvidenceDownload(caseId, evidenceId);
  const queryKey = evidenceKeys.download(scoped.caseId, scoped.evidenceId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      getEvidenceDownloadUrlFn({
        data: parseEvidenceScopeInput(scoped.caseId, scoped.evidenceId),
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    enabled,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
