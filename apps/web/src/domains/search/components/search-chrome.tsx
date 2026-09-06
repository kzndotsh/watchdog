import { KeyboardIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import { Suspense, useMemo, useState, type ReactNode } from "react";

import { CommandPalette } from "@/domains/search/components/command-palette";
import { ShortcutsSheet } from "@/domains/search/components/shortcuts-sheet";
import {
  SearchUiContext,
  useSearchUi,
} from "@/domains/search/hooks/use-search-ui";
import type { AppAction } from "@/shared/lib/app-action";
import type { HotkeyBinding } from "@/shared/lib/hotkeys";
import { useGlobalHotkeys } from "@/shared/lib/use-global-hotkeys";
import { ActionsContextMenu } from "@/shared/ui/actions-context-menu";
import { useSidebar } from "@/shared/ui/shadcn/sidebar";

/** Shell chrome: Mod+K palette, Mod+B sidebar, ? shortcuts. */
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

    const searchAction: AppAction = {
      id: "command-palette",
      label: "Search…",
      group: "app",
      icon: SearchIcon,
      shortcut: "Mod+K",
      run: togglePalette,
    };
    const toggleSidebarAction: AppAction = {
      id: "toggle-sidebar",
      label: "Toggle sidebar",
      group: "app",
      icon: PanelLeftIcon,
      shortcut: "Mod+B",
      run: toggleSidebar,
    };
    const shortcutsAction: AppAction = {
      id: "shortcuts",
      label: "Shortcuts",
      group: "app",
      icon: KeyboardIcon,
      shortcut: "?",
      run: openShortcuts,
    };

    return {
      openPalette,
      togglePalette,
      openShortcuts,
      chromeActions: [searchAction, toggleSidebarAction, shortcutsAction],
      paletteCommands: [toggleSidebarAction, shortcutsAction],
    };
  }, [toggleSidebar]);

  const bindings = useMemo<HotkeyBinding[]>(
    () => [
      {
        id: "command-palette",
        key: "k",
        mod: true,
        allowInEditable: true,
        run: searchUi.togglePalette,
      },
      {
        id: "toggle-sidebar",
        key: "b",
        mod: true,
        allowInEditable: true,
        run: toggleSidebar,
      },
      {
        id: "shortcuts",
        key: "?",
        run: searchUi.openShortcuts,
      },
    ],
    [searchUi, toggleSidebar]
  );

  useGlobalHotkeys(bindings);

  return (
    <SearchUiContext.Provider value={searchUi}>
      {children}
      <Suspense fallback={null}>
        <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} />
      </Suspense>
      <ShortcutsSheet open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </SearchUiContext.Provider>
  );
}

/** Inset `#app-main` fallback ContextMenu (app chrome only). */
export function AppInsetContextMenu({ children }: { children: ReactNode }) {
  const { chromeActions } = useSearchUi();

  return (
    <ActionsContextMenu
      actions={chromeActions}
      trigger={
        <div id="app-main" className="flex min-h-0 min-w-0 flex-1 flex-col" />
      }
    >
      {children}
    </ActionsContextMenu>
  );
}
