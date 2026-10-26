import { queryOptions } from "@tanstack/react-query";

import {
  getEvidenceDownloadUrlFn,
  getEvidenceFn,
  getEvidenceManyFn,
  listEvidencePageFn,
  listEvidencePickerPageFn,
  listEvidenceProviderCallsFn,
} from "@/domains/intake/intake.functions";
import type { EvidenceRecord } from "@/domains/intake/types";
import type { PickerPort, PickerQuery } from "@/shared/hooks/use-picker-source";
import { listView } from "@/shared/lib/list/list-view";
import {
  parseEvidenceScopeInput,
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeEvidenceDownload,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { evidenceList } from "@watchdog/schemas/evidence";

export const evidenceKeys = {
  all: (caseId: string) => ["evidence", caseId] as const,
  /** The URL dumps the Run form seeds a playbook from. */
  urlDumps: (caseId: string) => ["evidence", caseId, "url-dumps"] as const,
  /** The newest few items: the Case overview's Recent activity. */
  recent: (caseId: string) => ["evidence", caseId, "recent"] as const,
  byId: (caseId: string, evidenceId: string) =>
    ["evidence", caseId, "by-id", evidenceId] as const,
  download: (caseId: string, evidenceId: string) =>
    ["evidence", caseId, "download", evidenceId] as const,
  providerCalls: (caseId: string, evidenceId: string) =>
    ["evidence", caseId, "provider-calls", evidenceId] as const,
};

export const evidenceProviderCallsQuery = (
  caseId: string,
  evidenceId: string
) => {
  const { scoped, enabled } = scopeEvidenceDownload(caseId, evidenceId);
  const queryKey = evidenceKeys.providerCalls(scoped.caseId, scoped.evidenceId);
  return queryOptions({
    queryKey,
    queryFn: async () =>
      listEvidenceProviderCallsFn({
        data: parseEvidenceScopeInput(scoped.caseId, scoped.evidenceId),
      }),
    enabled,
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

/** Evidence rows the Case overview's Recent activity shows. */
const RECENT_EVIDENCE_LIMIT = 12;

/**
 * The Case's newest Evidence, one small page of the picker projection (title parts and capture
 * time, no body): the Case overview's Recent activity. Under `evidenceKeys.all`.
 */
export const recentEvidenceQuery = (caseId: string) => {
  const scopedCaseId = scopeCaseId(caseId);
  const queryKey = evidenceKeys.recent(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async () => {
      const page = await listEvidencePickerPageFn({
        data: { caseId: scopedCaseId, limit: RECENT_EVIDENCE_LIMIT },
      });
      return page.items;
    },
    enabled: scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

/** The scope of the Case's Evidence list: one per Case. */
export type EvidenceListScope = { readonly caseId: string };

/**
 * The Case's Evidence list (`evidenceList`, ADR-0007), a page at a time: the Dossier Evidence
 * tab with `entityId` fixed. Keys sit under `evidenceKeys.all`, so every Evidence invalidation
 * refreshes each open view.
 */
export const evidenceListView = listView(evidenceList, {
  domain: "evidence",
  scopeKey: ({ caseId }: EvidenceListScope) => [scopeCaseId(caseId)],
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
  fetchPage: async ({ scope, params, cursor }) =>
    listEvidencePageFn({
      data: {
        ...params,
        caseId: scopeCaseId(scope.caseId),
        ...(cursor === undefined ? {} : { cursor }),
      },
    }),
  getId: (row: EvidenceRecord) => row.id,
  staleTime: STALE_DEFAULT,
  gcTime: GC_DEFAULT,
});

/**
 * One Evidence item by id, for a URL-selected row the list has not loaded; null when it is not
 * in the Case (deleted, or a stale link). Never runs without an id (`evidenceId` null).
 */
export const evidenceByIdQuery = (
  caseId: string,
  evidenceId: string | null
) => {
  const { scoped, enabled } = scopeEvidenceDownload(caseId, evidenceId ?? "");
  return queryOptions({
    queryKey: evidenceKeys.byId(scoped.caseId, scoped.evidenceId),
    queryFn: async () =>
      getEvidenceFn({
        data: parseEvidenceScopeInput(scoped.caseId, scoped.evidenceId),
      }),
    enabled: evidenceId !== null && enabled,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};

/** One picker page: small, so a picker never reads more than this many rows per request. */
const EVIDENCE_PICKER_LIMIT = 20;

function evidenceOptionOf(
  row: Pick<EvidenceRecord, "id" | "kind" | "label" | "sourceUrl" | "sha256">
): EvidenceOption {
  return {
    id: row.id,
    kind: row.kind,
    label: row.label,
    sourceUrl: row.sourceUrl,
    sha256: row.sha256,
  };
}

/**
 * The Evidence pickers' reads (#559): one page of the Case's active Evidence list as the picker
 * projection (`evidence.pickerPage`, #566: title parts, no body), newest first when `q` is null,
 * else its server search; titles by id through `evidence.getMany` (hidden
 * Evidence included). Keys sit under `evidenceKeys.all`, so every Evidence invalidation reaches them.
 */
export function evidencePickerPort(caseId: string): PickerPort<EvidenceOption> {
  const scopedCaseId = scopeCaseId(caseId);
  const enabled = scopeCaseIdEnabled(caseId);
  return {
    search: (q): PickerQuery<EvidenceOption> => ({
      queryKey: [...evidenceKeys.all(scopedCaseId), "picker", q ?? ""],
      queryFn: async () => {
        const page = await listEvidencePickerPageFn({
          data: {
            caseId: scopedCaseId,
            limit: EVIDENCE_PICKER_LIMIT,
            ...(q === null ? {} : { q }),
          },
        });
        return page.items.map(evidenceOptionOf);
      },
      enabled,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    }),
    byIds: (ids): PickerQuery<EvidenceOption> => ({
      queryKey: [...evidenceKeys.all(scopedCaseId), "by-ids", ...ids],
      queryFn: async () => {
        const rows = await getEvidenceManyFn({
          data: { caseId: scopedCaseId, ids: [...ids] },
        });
        return rows.map(evidenceOptionOf);
      },
      enabled: enabled && ids.length > 0,
      staleTime: STALE_DEFAULT,
      gcTime: GC_DEFAULT,
    }),
  };
}

/** The URL dumps a playbook run can seed from: the newest few, a small page, never the whole list. */
const URL_DUMP_LIMIT = 50;

export type UrlDumpOption = {
  readonly id: string;
  readonly sourceUrl: string;
  readonly label: string | null;
};

/**
 * The Case's newest URL archives (one page of the Evidence list with `kind` url_archive) for the
 * Run form's "URL dump" select. Reads only while `isEnabled` (the Run popover is open). Under
 * `evidenceKeys.all`, so every Evidence invalidation reaches it.
 */
export const urlDumpsQuery = (caseId: string, isEnabled: boolean) => {
  const scopedCaseId = scopeCaseId(caseId);
  return queryOptions({
    queryKey: evidenceKeys.urlDumps(scopedCaseId),
    queryFn: async (): Promise<UrlDumpOption[]> => {
      const page = await listEvidencePageFn({
        data: {
          caseId: scopedCaseId,
          kind: ["url_archive"],
          limit: URL_DUMP_LIMIT,
        },
      });
      return page.items.flatMap((row) => {
        const sourceUrl = row.sourceUrl?.trim();
        return sourceUrl === undefined || sourceUrl === ""
          ? []
          : [{ id: row.id, sourceUrl, label: row.label }];
      });
    },
    enabled: isEnabled && scopeCaseIdEnabled(caseId),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    placeholderData: placeholderDataForQueryKey(
      evidenceKeys.urlDumps(scopedCaseId)
    ),
  });
};
