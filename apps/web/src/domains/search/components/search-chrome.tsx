import { KeyboardIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ShortcutsDialog } from "@/domains/search/components/shortcuts-dialog";
import { useDataHotkeys } from "@/domains/search/hooks/use-data-hotkeys";
import { useGlobalHotkeys } from "@/domains/search/hooks/use-global-hotkeys";
import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import type { AppAction } from "@/shared/lib/app-action";
import { hotkeyBindings, hotkeyDef, type HotkeyId } from "@/shared/lib/hotkeys";
import { lazyOverlay } from "@/shared/lib/lazy-overlay";
import { memoizeImport } from "@/shared/lib/preload-import";
import { useSidebar } from "@watchdog/ui/components/sidebar";

/**
 * The palette (cmdk, a dialog and their dependencies) is its own chunk, kept out of the
 * signed-in shell and fetched once the browser is idle, so the first Mod+K finds it loaded.
 */
const CommandPalette = lazyOverlay(
  memoizeImport(
    async () => import("@/domains/search/components/command-palette")
  ),
  (module) => module.CommandPalette,
  { shouldPrefetch: true }
);

/** An AppAction whose id, label and chord come from the `HOTKEYS` registry. */
function registryAction(
  id: HotkeyId,
  rest: Pick<AppAction, "icon" | "run"> & { label?: string }
): AppAction {
  return {
    id,
    label: hotkeyDef(id).label,
    group: "app",
    hotkey: id,
    ...rest,
  };
}

/**
 * Shell chrome: the `global` registry bindings (Mod+K, ?) and `data-hotkey`
 * controls. Mod+B is owned by the upstream `SidebarProvider` listener (vendored,
 * unpatched): binding it here too would toggle twice, so the registry marks it
 * `sidebar-provider` and `hotkeyBindings` skips it. The menu action only runs the toggle.
 */
export function SearchChrome({ children }: { children: ReactNode }) {
  const { toggleSidebar } = useSidebar();
  const [isPaletteOpen, setIsPaletteOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  const searchUi = useMemo(() => {
    const openPalette = () => {
      setIsPaletteOpen(true);
    };
    const togglePalette = () => {
      setIsPaletteOpen((open) => !open);
    };
    const openShortcuts = () => {
      setIsShortcutsOpen(true);
    };

    const chromeActions = [
      registryAction("command-palette", {
        label: "Search…",
        icon: SearchIcon,
        run: togglePalette,
      }),
      registryAction("toggle-sidebar", {
        icon: PanelLeftIcon,
        run: toggleSidebar,
      }),
      registryAction("shortcuts", { icon: KeyboardIcon, run: openShortcuts }),
    ];

    return {
      openPalette,
      togglePalette,
      openShortcuts,
      chromeActions,
      paletteCommands: chromeActions.filter(
        (action) => action.hotkey && hotkeyDef(action.hotkey).isPalette === true
      ),
    };
  }, [toggleSidebar]);

  const bindings = useMemo(
    () =>
      hotkeyBindings({
        // A hotkey has no trigger to return to: the dialog would refocus whatever held focus (a
        // nav link clicked earlier) and, closed with Escape, draw its keyboard focus ring there.
        "command-palette": () => {
          if (document.activeElement instanceof HTMLElement) {
            document.activeElement.blur();
          }
          searchUi.togglePalette();
        },
        shortcuts: searchUi.openShortcuts,
      }),
    [searchUi]
  );

  useGlobalHotkeys(bindings);
  useDataHotkeys();

  return (
    <SearchUiContext.Provider value={searchUi}>
      {children}
      <CommandPalette open={isPaletteOpen} onOpenChange={setIsPaletteOpen} />
      <ShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />
    </SearchUiContext.Provider>
  );
}
