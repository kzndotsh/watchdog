import { useMemo, useState } from "react";

import type { PickerSource } from "@/shared/hooks/use-picker-source";

function noRetry(): void {
  // Nothing to fetch again: the rows are the screen's own.
}

/**
 * A picker source over records the screen already holds (Triage's Proposal Evidence), filtered
 * in the browser by `matches`. Lists that can grow use `usePickerSource` instead.
 */
export function useStaticPickerSource<T extends { readonly id: string }>(
  rows: readonly T[],
  matches: (row: T, text: string) => boolean
): PickerSource<T> {
  const [text, setText] = useState("");
  const options = useMemo(
    () => rows.filter((row) => matches(row, text)),
    [rows, matches, text]
  );
  const selected = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows]
  );
  return {
    text,
    onTextChange: setText,
    options,
    isShort: false,
    status: "ready",
    retry: noRetry,
    selected,
  };
}
