import { useEffect, useId, useRef } from "react";

import type { AppAction } from "@/shared/lib/app-action";
import { registerPaletteSource } from "@/shared/lib/palette-commands-store";

/**
 * Page-scoped palette commands. A mounted surface registers its `page`
 * AppActions here; they show in Mod+K while it is mounted and disappear on
 * unmount. Registration runs in effects (client only), so server renders
 * never see page commands.
 *
 * Register `actions` while the caller is mounted. Pass a memoized array;
 * `run` always reads the latest closure via a ref.
 */
export function usePaletteCommands(actions: readonly AppAction[]): void {
  const sourceId = useId();
  const latest = useRef(actions);

  useEffect(() => {
    latest.current = actions;
  }, [actions]);

  // Re-register only when the visible shape changes, not on every closure.
  const shapeKey = actions
    .map((a) =>
      JSON.stringify([
        a.id,
        a.label,
        a.disabled === true,
        a.group,
        a.icon?.displayName ?? a.icon?.name,
        a.hotkey,
        a.keywords,
        a.surfaces,
      ])
    )
    .join("|");

  useEffect(
    () =>
      registerPaletteSource(
        sourceId,
        latest.current.map((action) => ({
          ...action,
          run: () => {
            latest.current.find((a) => a.id === action.id)?.run();
          },
        }))
      ),
    [sourceId, shapeKey]
  );
}
