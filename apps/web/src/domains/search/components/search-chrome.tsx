import { KeyboardIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { CommandPalette } from "@/domains/search/components/command-palette";
import { ShortcutsDialog } from "@/domains/search/components/shortcuts-dialog";
import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import { useDataHotkeys } from "@/shared/hooks/use-data-hotkeys";
import { useGlobalHotkeys } from "@/shared/hooks/use-global-hotkeys";
import type { AppAction } from "@/shared/lib/app-action";
import { hotkeyBindings, hotkeyDef, type HotkeyId } from "@/shared/lib/hotkeys";
import { useSidebar } from "@watchdog/ui/components/sidebar";

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
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const searchUi = useMemo(() => {
    const openPalette = () => {
      setPaletteOpen(true);
    };
    const togglePalette = () => {
      setPaletteOpen((open) => !open);
    };
    const openShortcuts = () => {
      setShortcutsOpen(true);
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
        (action) => action.hotkey && hotkeyDef(action.hotkey).palette === true
      ),
    };
  }, [toggleSidebar]);

  const bindings = useMemo(
    () =>
      hotkeyBindings({
        "command-palette": searchUi.togglePalette,
        shortcuts: searchUi.openShortcuts,
      }),
    [searchUi]
  );

  useGlobalHotkeys(bindings);
  useDataHotkeys();

  return (
    <SearchUiContext.Provider value={searchUi}>
      {children}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </SearchUiContext.Provider>
  );
}
