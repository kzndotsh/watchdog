import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { evidenceByIdQuery } from "@/domains/intake/queries";
import type { EvidenceRecord } from "@/domains/intake/types";
import { couldnt, errMessage } from "@/lib/utils";
import { TOAST_EVIDENCE_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";

type SelectedEvidenceArgs = {
  readonly caseId: string;
  /** `?id=`; null without a selection. */
  readonly selectedId: string | null;
  /** The rows of the loaded pages. */
  readonly rows: readonly EvidenceRecord[];
  /** The list's first page has landed (status is not `pending`). */
  readonly isListSettled: boolean;
  /** Drop `?id=` from the URL. */
  readonly onClear: () => void;
};

export type SelectedEvidence = {
  /** The selected row, from a loaded page or read by id; null while unknown or without one. */
  readonly selected: EvidenceRecord | null;
  /** The by-id read failed: the copy for the error state. */
  readonly error: string | null;
  readonly retry: () => void;
};

/**
 * The Evidence tab's URL selection. A row on a loaded page is used as is. Only once the first
 * page has landed without it is the row read by id (`evidence.get`), so a link to a row on page
 * one never costs a second request. A row the Case no longer holds clears `?id=` with a notice;
 * a failed read is the caller's error state (Retry, Clear selection).
 */
export function useSelectedEvidence({
  caseId,
  selectedId,
  rows,
  isListSettled,
  onClear,
}: SelectedEvidenceArgs): SelectedEvidence {
  const loaded =
    selectedId === null ? undefined : rows.find((row) => row.id === selectedId);
  const readId =
    selectedId !== null && loaded === undefined && isListSettled
      ? selectedId
      : null;
  const query = useQuery(evidenceByIdQuery(caseId, readId));
  const isGone = readId !== null && query.isSuccess && query.data === null;

  // Writing the URL and showing a toast are the external effects of a gone selection.
  const clearGone = useEffectEvent(() => {
    toast.info(TOAST_EVIDENCE_SELECTION_GONE);
    onClear();
  });
  useEffect(() => {
    if (isGone) clearGone();
  }, [isGone]);

  return {
    selected: loaded ?? (readId === null ? null : (query.data ?? null)),
    error:
      readId !== null && query.isError
        ? errMessage(query.error, couldnt("load", "the selected evidence item"))
        : null,
    retry: () => {
      void query.refetch();
    },
  };
}
