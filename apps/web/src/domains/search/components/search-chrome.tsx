import { KeyboardIcon, PanelLeftIcon, SearchIcon } from "lucide-react";
import {
  Suspense,
  lazy,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { ShortcutsDialog } from "@/domains/search/components/shortcuts-dialog";
import { SearchUiContext } from "@/domains/search/hooks/use-search-ui";
import { useDataHotkeys } from "@/shared/hooks/use-data-hotkeys";
import { useGlobalHotkeys } from "@/shared/hooks/use-global-hotkeys";
import type { AppAction } from "@/shared/lib/app-action";
import { hotkeyBindings, hotkeyDef, type HotkeyId } from "@/shared/lib/hotkeys";
import { useSidebar } from "@watchdog/ui/components/sidebar";

/**
 * The palette (cmdk, a dialog and their dependencies) is its own chunk, kept out of the
 * signed-in shell and fetched once the browser is idle, so the first Mod+K finds it loaded.
 */
const loadCommandPalette = async () =>
  import("@/domains/search/components/command-palette");
const prefetchCommandPalette = async () => {
  try {
    await loadCommandPalette();
  } catch {
    // The first open retries the import and shows its own failure.
  }
};
const CommandPalette = lazy(async () => {
  const { CommandPalette: component } = await loadCommandPalette();
  return { default: component };
});
const PALETTE_PREFETCH_MS = 2000;

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
  // Mounted on the first open and kept, so a close keeps its state and exit animation.
  const [isPaletteMounted, setIsPaletteMounted] = useState(false);
  if (isPaletteOpen && !isPaletteMounted) setIsPaletteMounted(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      void prefetchCommandPalette();
    }, PALETTE_PREFETCH_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

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
      {isPaletteMounted ? (
        <Suspense fallback={null}>
          <CommandPalette
            open={isPaletteOpen}
            onOpenChange={setIsPaletteOpen}
          />
        </Suspense>
      ) : null}
      <ShortcutsDialog
        open={isShortcutsOpen}
        onOpenChange={setIsShortcutsOpen}
      />
    </SearchUiContext.Provider>
  );
}
