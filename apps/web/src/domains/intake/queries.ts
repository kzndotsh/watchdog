import { queryOptions } from "@tanstack/react-query";

import type { EvidenceRecord } from "@/domains/intake/types";
import { orpc } from "@/lib/orpc-client";
import { orpcNullIfNotFound } from "@/lib/orpc-null-if-not-found";
import type { PickerPort, PickerQuery } from "@/shared/hooks/use-picker-source";
import { listView } from "@/shared/lib/list/list-view";
import {
  scopeCaseId,
  scopeCaseIdEnabled,
  scopeEvidenceDownload,
} from "@/shared/lib/query-ingress";
import { placeholderDataForQueryKey } from "@/shared/lib/query-placeholder";
import { GC_DEFAULT, STALE_DEFAULT } from "@/shared/lib/query-stale";
import type { EvidenceOption } from "@/shared/ui/intake/evidence-option";
import { evidenceList } from "@watchdog/domain/schemas/evidence";

/** Evidence rows the Case overview's Recent activity shows. */
const RECENT_EVIDENCE_LIMIT = 12;

/** The URL dumps a playbook run can seed from: the newest few, a small page, never the whole list. */
const URL_DUMP_LIMIT = 50;

/** One picker page: small, so a picker never reads more than this many rows per request. */
const EVIDENCE_PICKER_LIMIT = 20;

/**
 * Evidence keys are the oRPC procedure keys (`[path, { input, type }]`): `all(caseId)` is the
 * partial key `[["evidence"], { input: { caseId } }]`, every Evidence query of the Case whatever
 * its procedure, filters or cursor. The other members are the exact keys of single reads.
 */
export const evidenceKeys = {
  all: (caseId: string) => orpc.evidence.key({ input: { caseId } }),
  /** The URL dumps the Run form seeds a playbook from. */
  urlDumps: (caseId: string) =>
    orpc.evidence.list.key({
      type: "query",
      input: { caseId, kind: ["url_archive"], limit: URL_DUMP_LIMIT },
    }),
  /** The newest few items: the Case overview's Recent activity. */
  recent: (caseId: string) =>
    orpc.evidence.pickerPage.key({
      type: "query",
      input: { caseId, limit: RECENT_EVIDENCE_LIMIT },
    }),
  byId: (caseId: string, evidenceId: string) =>
    orpc.evidence.get.key({ type: "query", input: { caseId, evidenceId } }),
  download: (caseId: string, evidenceId: string) =>
    orpc.evidence.downloadUrl.key({
      type: "query",
      input: { caseId, evidenceId },
    }),
  providerCalls: (caseId: string, evidenceId: string) =>
    orpc.evidence.listProviderCalls.key({
      type: "query",
      input: { caseId, evidenceId },
    }),
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
      orpc.evidence.listProviderCalls.call({
        caseId: scoped.caseId,
        evidenceId: scoped.evidenceId,
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
      orpc.evidence.downloadUrl.call({
        caseId: scoped.caseId,
        evidenceId: scoped.evidenceId,
      }),
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
    enabled,
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};

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
      const page = await orpc.evidence.pickerPage.call({
        caseId: scopedCaseId,
        limit: RECENT_EVIDENCE_LIMIT,
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
 * The Case's Evidence list (`evidenceList`, ADR-0007), a page at a time through `evidence.list`:
 * the Dossier Evidence tab with `entityId` fixed. Keys sit under `evidenceKeys.all`, so every
 * Evidence invalidation refreshes each open view.
 */
export const evidenceListView = listView(evidenceList, {
  procedure: orpc.evidence.list,
  scopeInput: ({ caseId }: EvidenceListScope) => ({
    caseId: scopeCaseId(caseId),
  }),
  input: ({ scope, params, cursor }) => ({
    ...params,
    caseId: scopeCaseId(scope.caseId),
    ...(cursor === undefined ? {} : { cursor }),
  }),
  isScopeReady: ({ caseId }) => scopeCaseIdEnabled(caseId),
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
      orpcNullIfNotFound(
        orpc.evidence.get.call({
          caseId: scoped.caseId,
          evidenceId: scoped.evidenceId,
        })
      ),
    enabled: evidenceId !== null && enabled,
    staleTime: STALE_DEFAULT,
    gcTime: GC_DEFAULT,
  });
};

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
    search: (q): PickerQuery<EvidenceOption> => {
      const input = {
        caseId: scopedCaseId,
        limit: EVIDENCE_PICKER_LIMIT,
        ...(q === null ? {} : { q }),
      };
      return {
        queryKey: orpc.evidence.pickerPage.key({ type: "query", input }),
        queryFn: async () => {
          const page = await orpc.evidence.pickerPage.call(input);
          return page.items.map(evidenceOptionOf);
        },
        enabled,
        staleTime: STALE_DEFAULT,
        gcTime: GC_DEFAULT,
      };
    },
    byIds: (ids): PickerQuery<EvidenceOption> => {
      const input = { caseId: scopedCaseId, ids: [...ids] };
      return {
        queryKey: orpc.evidence.getMany.key({ type: "query", input }),
        queryFn: async () => {
          const rows = await orpc.evidence.getMany.call(input);
          return rows.map(evidenceOptionOf);
        },
        enabled: enabled && ids.length > 0,
        staleTime: STALE_DEFAULT,
        gcTime: GC_DEFAULT,
      };
    },
  };
}

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
  const queryKey = evidenceKeys.urlDumps(scopedCaseId);
  return queryOptions({
    queryKey,
    queryFn: async (): Promise<UrlDumpOption[]> => {
      const page = await orpc.evidence.list.call({
        caseId: scopedCaseId,
        kind: ["url_archive"],
        limit: URL_DUMP_LIMIT,
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
    placeholderData: placeholderDataForQueryKey(queryKey),
  });
};
