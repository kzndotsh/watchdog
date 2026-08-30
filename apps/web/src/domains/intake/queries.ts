import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  getEvidenceDownloadUrlFn,
  listEvidenceFn,
} from "@/domains/intake/intake.functions";
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
  return queryOptions({
    queryKey: evidenceKeys.list(caseId, hiddenOnly),
    queryFn: async () => listEvidenceFn({ data: { caseId, hiddenOnly } }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: keepPreviousData,
  });
};

export const evidenceDownloadUrlQuery = (caseId: string, evidenceId: string) =>
  queryOptions({
    queryKey: evidenceKeys.download(caseId, evidenceId),
    queryFn: async () =>
      getEvidenceDownloadUrlFn({ data: { caseId, evidenceId } }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    enabled: evidenceId.length > 0,
  });
