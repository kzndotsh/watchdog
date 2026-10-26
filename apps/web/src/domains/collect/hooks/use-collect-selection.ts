import { useQuery } from "@tanstack/react-query";
import { useEffect, useEffectEvent } from "react";

import { collectItemQuery } from "@/domains/collect/queries";
import { couldnt, errMessage } from "@/lib/utils";
import { TOAST_COLLECT_SELECTION_GONE } from "@/shared/lib/toast-copy";
import { toast } from "@/shared/ui/toast";
import type { CollectQueueItem } from "@watchdog/core/jobs";

type CollectSelectionArgs = {
  readonly caseId: string;
  /** `?id=`: a row id, a member Job's id or a run's id; null without one. */
  readonly urlId: string | null;
  /** The rows of the loaded pages. */
  readonly items: readonly CollectQueueItem[];
  /** The list's first page has landed (status is not `pending`). */
  readonly isListSettled: boolean;
  /** The list is the hidden Evidence view (`hidden` on): by-id reads look there. */
  readonly isHiddenView: boolean;
  /** The row the user was on when they picked a Job inside it: it stays selected. */
  readonly anchorRowId: string | null;
  /** Drop `?id=` from the URL. */
  readonly onClear: () => void;
};

export type CollectSelection = {
  /** The id that stands selected: `?id=`, else the first row; null with neither. */
  readonly selectedId: string | null;
  /** The selected row, from a loaded page or read by id; null while unknown or without one. */
  readonly item: CollectQueueItem | null;
  /** The member Job to show: set when the id named a Job (or a run that attached), not a row. */
  readonly focusJobId: string | null;
  /** A by-id read is in flight, with nothing to show yet. */
  readonly isLoading: boolean;
  /** The by-id read failed: the copy for the error state. */
  readonly error: string | null;
  readonly retry: () => void;
};

type Located = {
  readonly item: CollectQueueItem;
  readonly focusJobId: string | null;
};

/**
 * The id on a loaded page: a row id; else a Job of the row the user is on (`anchorRowId`), so
 * picking a step never jumps to another row holding the same Job; else the first loaded row that
 * holds the Job.
 */
function locateLoaded(
  items: readonly CollectQueueItem[],
  id: string,
  anchorRowId: string | null
): Located | null {
  const exact = items.find((item) => item.id === id);
  if (exact !== undefined) return { item: exact, focusJobId: null };
  const holdsJob = (item: CollectQueueItem) =>
    item.jobs.some((job) => job.id === id);
  const item =
    items.find((row) => row.id === anchorRowId && holdsJob(row)) ??
    items.find(holdsJob);
  return item === undefined ? null : { item, focusJobId: id };
}

/** The id to read through `collect.get`: only a selection the loaded pages lack, once page one landed. */
function idToRead(
  selectedId: string | null,
  loaded: Located | null,
  isListSettled: boolean
): string | null {
  return selectedId !== null && loaded === null && isListSettled
    ? selectedId
    : null;
}

/**
 * Collect's URL selection. A row on a loaded page is used as is. Only once the first page has
 * landed without it is the id read (`collect.get`: a row, a Job in a row, or a run whose steps
 * attached to Evidence), so a link to a row on page one never costs a second request. An id the
 * Case holds nothing for clears `?id=` with a notice; a failed read is the caller's error state
 * (Retry, Clear selection). Without `?id=` the first row stands selected (the screen writes it).
 */
export function useCollectSelection({
  caseId,
  urlId,
  items,
  isListSettled,
  isHiddenView,
  anchorRowId,
  onClear,
}: CollectSelectionArgs): CollectSelection {
  const selectedId = urlId ?? items[0]?.id ?? null;
  const loaded =
    selectedId === null ? null : locateLoaded(items, selectedId, anchorRowId);
  const readId = idToRead(selectedId, loaded, isListSettled);
  const query = useQuery(collectItemQuery(caseId, readId, isHiddenView));

  // Writing the URL and showing a toast are the external effects of a gone selection.
  const clearGone = useEffectEvent(() => {
    toast.info(TOAST_COLLECT_SELECTION_GONE);
    onClear();
  });
  const isGone = readId !== null && query.isSuccess && query.data === null;
  useEffect(() => {
    if (isGone) clearGone();
  }, [isGone]);

  const found = loaded ?? (readId === null ? null : (query.data ?? null));
  const hasFailed = readId !== null && query.isError;
  return {
    selectedId,
    item: found?.item ?? null,
    focusJobId: found?.focusJobId ?? null,
    isLoading: readId !== null && query.isPending,
    error: hasFailed
      ? errMessage(query.error, couldnt("load", "the selected item"))
      : null,
    retry: () => {
      void query.refetch();
    },
  };
}
