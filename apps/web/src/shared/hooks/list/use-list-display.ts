import type { ColumnVisibilityState } from "@tanstack/react-table";
import { useCallback, useSyncExternalStore } from "react";

import {
  DEFAULT_LIST_DISPLAY,
  readListDisplay,
  subscribeListDisplay,
  writeListDisplay,
  type ListDensity,
  type StoredListDisplay,
} from "@/shared/lib/list/list-display-store";

/** A screen's presentation toggle in the Display options popover's "Other" section. */
export type ListDisplayToggle = {
  readonly id: string;
  /** "Wrap long values", "Full names". */
  readonly label: string;
  readonly isDefaultOn: boolean;
};

export type ListDisplay = {
  /** TanStack column visibility (tables): hidden columns are `false`. */
  readonly columnVisibility: ColumnVisibilityState;
  readonly setColumnVisible: (columnId: string, isVisible: boolean) => void;
  /** The table's own visibility change (TanStack `onColumnVisibilityChange`). */
  readonly setColumnVisibility: (next: ColumnVisibilityState) => void;
  readonly resetColumns: () => void;
  readonly toggles: readonly ListDisplayToggle[];
  readonly isToggleOn: (id: string) => boolean;
  readonly setToggle: (id: string, isOn: boolean) => void;
  readonly density: ListDensity;
  readonly setDensity: (density: ListDensity) => void;
};

function getServerSnapshot(): StoredListDisplay {
  return DEFAULT_LIST_DISPLAY;
}

/**
 * Per-viewer presentation state of one list, stored locally under `wd.list.<key>` (never the
 * URL: it is not part of what a shared link shows). The server and the first client render read
 * the defaults, so hydration matches; the stored choice applies right after.
 */
export function useListDisplay(
  key: string,
  toggles: readonly ListDisplayToggle[] = []
): ListDisplay {
  const subscribe = useCallback(
    (onChange: () => void) => subscribeListDisplay(key, onChange),
    [key]
  );
  const getSnapshot = useCallback(() => readListDisplay(key), [key]);
  const stored = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot
  );

  const write = (patch: Partial<StoredListDisplay>) => {
    writeListDisplay(key, { ...readListDisplay(key), ...patch });
  };

  return {
    columnVisibility: Object.fromEntries(
      stored.hiddenColumns.map((id) => [id, false])
    ),
    setColumnVisible: (columnId, isVisible) => {
      const hidden = stored.hiddenColumns.filter((id) => id !== columnId);
      write({ hiddenColumns: isVisible ? hidden : [...hidden, columnId] });
    },
    setColumnVisibility: (next) => {
      write({
        hiddenColumns: Object.entries(next)
          .filter(([, isVisible]) => !isVisible)
          .map(([id]) => id),
      });
    },
    resetColumns: () => {
      write({ hiddenColumns: [] });
    },
    toggles,
    isToggleOn: (id) =>
      stored.toggles[id] ??
      toggles.find((toggle) => toggle.id === id)?.isDefaultOn ??
      false,
    setToggle: (id, isOn) => {
      write({ toggles: { ...stored.toggles, [id]: isOn } });
    },
    density: stored.density,
    setDensity: (density) => {
      write({ density });
    },
  };
}
