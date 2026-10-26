import {
  keepPreviousData,
  useQueries,
  useQuery,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { useDebouncedValue } from "@/shared/hooks/use-debounced-value";
import { PICKER_SEARCH_DEBOUNCE_MS } from "@/shared/lib/debounce";
import { ARRAY_MAX, LIST_SEARCH_MIN_LENGTH } from "@watchdog/schemas/shared";

/** One read of a picker's records (a domain query: its key under the domain root, so invalidation reaches it). */
export type PickerQuery<T> = UseQueryOptions<readonly T[], Error, readonly T[]>;

/**
 * How a picker reads a declared list's records (ADR-0007), built by the domain's `queries.ts`
 * (`evidencePickerPort`, `entityPickerPort`): one small page by `q`, or the most recent records
 * when `q` is null; and records by id (`getMany`). Never the whole list.
 */
export type PickerPort<T> = {
  readonly search: (q: string | null) => PickerQuery<T>;
  readonly byIds: (ids: readonly string[]) => PickerQuery<T>;
};

export type PickerStatus = "pending" | "error" | "ready";

/** What a server-searched picker renders: the typed text, one page of options and the selected records. */
export type PickerSource<T> = {
  readonly text: string;
  readonly onTextChange: (text: string) => void;
  /** The most recent records while the box is empty or too short; the server's matches after. */
  readonly options: readonly T[];
  /** 1 or 2 characters typed: too short to search (`LIST_SEARCH_MIN_LENGTH`), so nothing was asked. */
  readonly isShort: boolean;
  readonly status: PickerStatus;
  readonly retry: () => void;
  /** The selected ids' records (a by-ids read), whether or not they are among the options. */
  readonly selected: ReadonlyMap<string, T>;
};

const NO_ROWS: readonly never[] = [];

/** Unique ids in a stable order, in requests of at most `ARRAY_MAX` (the by-ids input bound). */
function idChunks(ids: readonly string[]): string[][] {
  const unique = [...new Set(ids.filter((id) => id !== ""))].sort();
  const chunks: string[][] = [];
  for (let start = 0; start < unique.length; start += ARRAY_MAX) {
    chunks.push(unique.slice(start, start + ARRAY_MAX));
  }
  return chunks;
}

/** The answers of every by-ids request as one map (a stable `combine`: TanStack memoises it). */
function recordsById<T extends { readonly id: string }>(
  results: readonly { readonly data?: readonly T[] }[]
): ReadonlyMap<string, T> {
  const byId = new Map<string, T>();
  for (const result of results) {
    for (const row of result.data ?? NO_ROWS) byId.set(row.id, row);
  }
  return byId;
}

/**
 * Records by id through the port's by-ids read: titles of linked rows a screen shows (the ids on
 * its loaded page), or a picker's selected values. Keyed by the sorted id set; the previous answer
 * stands in while a changed set loads, so labels do not blink.
 */
export function useRecordsByIds<T extends { readonly id: string }>(
  port: PickerPort<T>,
  ids: readonly string[]
): ReadonlyMap<string, T> {
  const idsKey = ids.join("\n");
  const chunks = useMemo(() => idChunks(idsKey.split("\n")), [idsKey]);
  return useQueries({
    queries: chunks.map((chunk) => ({
      ...port.byIds(chunk),
      placeholderData: keepPreviousData,
    })),
    combine: recordsById<T>,
  });
}

/**
 * A server-searched picker's state (#559): the typed text (debounced), one small page from the
 * port (recent records when the box is empty, matches from 3 characters), and the selected
 * records by id. `isEnabled` false (a closed popover) asks nothing for the options.
 *
 * The port's identity does not matter: every read is keyed on the values the port was built
 * from (Case, `q`, kinds, ids), and no state or effect here depends on the port object, so a
 * caller that rebuilds an equal port each render keeps its typed text and its in-flight search.
 */
export function usePickerSource<T extends { readonly id: string }>(
  port: PickerPort<T>,
  selectedIds: readonly string[],
  { isEnabled = true }: { readonly isEnabled?: boolean } = {}
): PickerSource<T> {
  const [text, setText] = useState("");
  const trimmed = text.trim();
  const { value: settled } = useDebouncedValue(
    trimmed,
    PICKER_SEARCH_DEBOUNCE_MS,
    ""
  );
  const q = settled.length >= LIST_SEARCH_MIN_LENGTH ? settled : null;
  const base = port.search(q);
  const search = useQuery({
    ...base,
    enabled: isEnabled && base.enabled !== false,
    placeholderData: keepPreviousData,
  });
  const selected = useRecordsByIds(port, selectedIds);
  let status: PickerStatus = "ready";
  if (search.data === undefined) {
    status = search.isError ? "error" : "pending";
  }
  return {
    text,
    onTextChange: setText,
    options: search.data ?? NO_ROWS,
    isShort: trimmed.length > 0 && trimmed.length < LIST_SEARCH_MIN_LENGTH,
    status,
    retry: () => {
      void search.refetch();
    },
    selected,
  };
}
