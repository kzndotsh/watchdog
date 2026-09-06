import { createContext, useContext } from "react";

import type { AppAction } from "@/shared/lib/app-action";

export interface SearchUiValue {
  openPalette: () => void;
  togglePalette: () => void;
  openShortcuts: () => void;
  /** Inset `#app-main` ContextMenu (includes Search). */
  chromeActions: readonly AppAction[];
  /** Idle Mod+K Commands (excludes open-palette by construction). */
  paletteCommands: readonly AppAction[];
}

const SearchUiContext = createContext<SearchUiValue | null>(null);

export function useSearchUi(): SearchUiValue {
  const value = useContext(SearchUiContext);
  if (!value) {
    throw new Error("useSearchUi must be used within SearchChrome");
  }
  return value;
}

export { SearchUiContext };
